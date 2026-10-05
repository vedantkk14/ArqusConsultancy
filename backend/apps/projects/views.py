"""Projects and expenses API. Every query starts from selectors.projects_for / expenses_for."""

import csv
import io

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.http import FileResponse, HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status as http
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.core.pagination import StandardPagination
from apps.core.permissions import ADMIN, PROJECT_MANAGER, SALES_MANAGER, HasRole

from . import integrations, rules, selectors, services
from .filters import (
    PROJECT_SUMMARY_SKIP,
    apply_expense_filters,
    apply_expense_ordering,
    apply_project_filters,
    apply_project_ordering,
)
from .models import Expense, ProjectEvent, ProjectStatus
from .serializers import (
    AssignPMSerializer,
    ConvertSerializer,
    EventSerializer,
    ExpenseWriteSerializer,
    ProjectUpdateSerializer,
    ReasonSerializer,
    expense_serializer,
    project_serializer,
)

ROLES = (ADMIN, PROJECT_MANAGER, SALES_MANAGER)
#: Read-only roles: every write (convert, edit, PM, complete/reopen, expenses) is 403 for them.
READ_ONLY_ROLES = (SALES_MANAGER,)
INELIGIBLE_MAX = 200
#: Orderings that would reveal money through the order itself.
MONEY_ORDERINGS = ("-usage_pct", "-spent")


class _Echo:
    def write(self, value):
        return value


def csv_safe(value) -> str:
    """Neutralise spreadsheet formulas: prefix cells starting with = + - @ with an apostrophe."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


#: A narrowing filter hides the past projects: they would not match it anyway.
HISTORY_BLOCKERS = (
    "state",
    "over_budget",
    "near_limit",
    "no_pm",
    "pm",
    "created_from",
    "created_to",
)


def _wants_history(params) -> bool:
    """`?status=RUNNING&history=1`: also list the completed projects of the same clients."""
    return (
        (params.get("history") or "").lower() in ("1", "true", "yes")
        and (params.get("status") or "").upper() == "RUNNING"
        and not any(params.get(key) for key in HISTORY_BLOCKERS)
    )


def _expense_input(request, partial=False):
    serializer = ExpenseWriteSerializer(data=request.data, partial=partial)
    serializer.is_valid(raise_exception=True)
    data = dict(serializer.validated_data)
    return data, data.pop("receipt", None)


class ProjectViewSet(GenericViewSet):
    permission_classes = [HasRole(*ROLES)]
    pagination_class = StandardPagination
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return selectors.with_client_numbers(
            selectors.budget_usage_qs(selectors.projects_for(self.request.user))
        )

    def _is_admin(self) -> bool:
        return self.request.user.role == ADMIN

    def _filtered(self, request, skip: tuple[str, ...] = ()):
        # Budget-state filters compare expenses with the deal total: Admin only.
        if not self._is_admin():
            skip = (*skip, "state")
        return apply_project_filters(self.get_queryset(), request.query_params, skip=skip)

    def _with_history(self, running):
        """Running projects plus the completed projects of the same clients, so a returning
        client's earlier work sits right under their current project (#1, #2, ...)."""
        clients = running.exclude(opportunity__isnull=True).values("opportunity__lead")
        past = self.get_queryset().filter(
            status=ProjectStatus.COMPLETED, opportunity__lead__in=clients
        )
        return self.get_queryset().filter(
            Q(pk__in=running.values("pk")) | Q(pk__in=past.values("pk"))
        )

    def _require_admin(self):
        if self.request.user.role != ADMIN:
            raise PermissionDenied()

    def _require_writer(self):
        if self.request.user.role in READ_ONLY_ROLES:
            raise PermissionDenied()

    def _project(self, pk):
        return get_object_or_404(self.get_queryset().select_related("opportunity"), pk=pk)

    def _detail(self, pk) -> dict:
        project = self._project(pk)
        cls = project_serializer(self.request.user, detail=True)
        return cls(project, context={"request": self.request}).data

    # ---- Collections ----------

    def list(self, request):
        ordering = request.query_params.get("ordering")
        if not self._is_admin() and ordering == "-usage_pct":
            ordering = None  # budget usage is Admin-only
        if request.user.role in READ_ONLY_ROLES and ordering in MONEY_ORDERINGS:
            ordering = None
        qs = self._filtered(request)
        if _wants_history(request.query_params):
            qs = self._with_history(qs)
        qs = apply_project_ordering(qs, ordering)
        page = self.paginate_queryset(qs)
        cls = project_serializer(request.user)
        return self.get_paginated_response(cls(page, many=True, context={"request": request}).data)

    def create(self, request):
        self._require_admin()
        serializer = ConvertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        project = services.convert(
            data["opportunity"],
            name=data["name"],
            pm_id=data.get("pm"),
            start_date=data.get("start_date"),
            expected_end_date=data.get("expected_end_date"),
            scope=data.get("scope", ""),
            by=request.user,
        )
        return Response(self._detail(project.pk), status=http.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        return Response(self._detail(pk))

    def partial_update(self, request, pk=None):
        self._require_admin()
        project = self._project(pk)
        serializer = ProjectUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        services.update_details(project.pk, dict(serializer.validated_data), request.user)
        return Response(self._detail(project.pk))

    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = self._filtered(request, skip=PROJECT_SUMMARY_SKIP)
        wanted = (request.query_params.get("status") or "").upper()
        data = selectors.project_summary(
            qs, wanted if wanted in ProjectStatus.values else ProjectStatus.RUNNING
        )
        if not self._is_admin():
            for key in ("no_pm", "ok", "warn", "over", "budget_total"):
                data.pop(key)
        if request.user.role in READ_ONLY_ROLES:
            data.pop("spent_total")
        return Response(data)

    @action(detail=False, methods=["get"])
    def convertible(self, request):
        """Won deals (opportunities) that can become projects, with the client's name.

        `?opportunity=<id>` looks one deal up and says why not; `?lead=<id>` does the same for the
        lead's current deal.
        """
        self._require_admin()
        deals_qs = (
            integrations.opportunity_model()
            .objects.filter(lead__is_deleted=False)
            .select_related("lead", "assigned_to")
        )
        wanted = request.query_params.get("opportunity", "")
        lead_wanted = request.query_params.get("lead", "")
        if wanted.isdigit():
            deals = list(deals_qs.filter(pk=int(wanted)))
        elif lead_wanted.isdigit():
            wanted = lead_wanted
            deals = list(deals_qs.filter(lead_id=int(lead_wanted)).order_by("-sequence_no")[:1])
        else:
            deals = list(
                deals_qs.filter(status="WON", project__isnull=True).order_by("won_at", "id")[
                    :INELIGIBLE_MAX
                ]
            )
        from .models import Project

        existing = dict(
            Project.objects.filter(opportunity_id__in=[d.pk for d in deals]).values_list(
                "opportunity_id", "id"
            )
        )
        rows = []
        for deal in deals:
            if deal.pk in existing:
                reason = "project_exists"
            elif deal.status != "WON":
                reason = "not_won"
            else:
                reason = integrations.finalization_problem(deal)
            if reason and not wanted:
                continue
            total = integrations.deal_total(deal)
            rows.append(
                {
                    "opportunity": deal.pk,
                    "sequence_no": deal.sequence_no,
                    "lead": deal.lead_id,
                    "name": deal.lead.name,
                    "exec_name": deal.assigned_to.display_name if deal.assigned_to else None,
                    "requirements": (deal.requirements or deal.lead.requirements or "").strip(),
                    "won_at": deal.won_at,
                    "proposed_amount": selectors.money_str(deal.proposed_amount)
                    if deal.proposed_amount is not None
                    else None,
                    "total_amount": None if total is None else selectors.money_str(total),
                    "ineligible_reason": reason,
                    "project_id": existing.get(deal.pk),
                }
            )
        return Response({"count": len(rows), "results": rows})

    @action(detail=False, methods=["get"])
    def managers(self, request):
        """Active project managers with their running-project count (for the assign selects)."""
        self._require_admin()
        users = (
            get_user_model()
            .objects.filter(role=PROJECT_MANAGER, is_active=True)
            .annotate(
                running=Count("managed_projects", filter=Q(managed_projects__status="RUNNING"))
            )
            .order_by("first_name", "username")
        )
        return Response(
            [{"id": u.pk, "name": u.display_name, "running_projects": u.running} for u in users]
        )

    # ---- One project ----------

    @action(detail=True, methods=["post"], url_path="assign-pm")
    def assign_pm(self, request, pk=None):
        self._require_admin()
        project = self._project(pk)
        serializer = AssignPMSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.assign_pm(project.pk, serializer.validated_data["pm"], request.user)
        return Response(self._detail(project.pk))

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        self._require_writer()
        project = self._project(pk)
        services.complete(project.pk, request.user)
        return Response(self._detail(project.pk))

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        self._require_admin()
        project = self._project(pk)
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.reopen(project.pk, serializer.validated_data["reason"], request.user)
        return Response(self._detail(project.pk))

    @action(detail=True, methods=["get"])
    def events(self, request, pk=None):
        project = self._project(pk)
        qs = ProjectEvent.objects.filter(project=project).select_related("actor")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(
            EventSerializer(page, many=True, context={"request": request}).data
        )

    @action(detail=True, methods=["get", "post"])
    def expenses(self, request, pk=None):
        project = self._project(pk)
        user = request.user
        if request.method == "POST":
            # A Sales Manager may log an expense on a running project (amounts stay hidden).
            data, upload = _expense_input(request)
            expense = services.add_expense(project.pk, user, data, upload)
            expense = selectors.expenses_for(user).get(pk=expense.pk)
            cls = expense_serializer(user)
            return Response(
                cls(expense, context={"request": request}).data, status=http.HTTP_201_CREATED
            )
        qs = selectors.expenses_for(user).filter(project=project)
        qs = apply_expense_ordering(
            apply_expense_filters(qs, request.query_params), request.query_params.get("ordering")
        )
        page = self.paginate_queryset(qs)
        cls = expense_serializer(user)
        return self.get_paginated_response(cls(page, many=True, context={"request": request}).data)


class ExpenseViewSet(GenericViewSet):
    permission_classes = [HasRole(*ROLES)]
    pagination_class = StandardPagination
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return selectors.expenses_for(self.request.user)

    def _require_admin(self):
        if self.request.user.role != ADMIN:
            raise PermissionDenied()

    def _one(self, pk) -> dict:
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        cls = expense_serializer(self.request.user)
        return cls(expense, context={"request": self.request}).data

    def _filtered(self, request):
        return apply_expense_filters(self.get_queryset(), request.query_params)

    def list(self, request):
        qs = apply_expense_ordering(self._filtered(request), request.query_params.get("ordering"))
        page = self.paginate_queryset(qs)
        cls = expense_serializer(request.user)
        return self.get_paginated_response(cls(page, many=True, context={"request": request}).data)

    def retrieve(self, request, pk=None):
        return Response(self._one(pk))

    def partial_update(self, request, pk=None):
        if request.user.role in READ_ONLY_ROLES:
            raise PermissionDenied()
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        data, upload = _expense_input(request, partial=True)
        services.edit_expense(expense.pk, request.user, data, upload)
        return Response(self._one(expense.pk))

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        if request.user.role in READ_ONLY_ROLES:
            raise PermissionDenied()
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.void_expense(expense.pk, request.user, serializer.validated_data["reason"])
        return Response(self._one(expense.pk))

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        if request.user.role in READ_ONLY_ROLES:
            raise PermissionDenied()  # the receipt shows the amount; the list shows only the icon
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        if not expense.receipt:
            raise NotFound("This expense has no receipt.")
        ext = expense.receipt.name.rsplit(".", 1)[-1]
        response = FileResponse(
            expense.receipt.open("rb"),
            content_type=expense.receipt_type or "application/octet-stream",
        )
        response["Content-Disposition"] = f'inline; filename="receipt-{expense.pk}.{ext}"'
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response

    @action(detail=False, methods=["get"])
    def summary(self, request):
        if request.user.role in READ_ONLY_ROLES:
            raise PermissionDenied()  # totals are money
        qs = self._filtered(request)
        active = qs.filter(is_void=False)
        totals = active.aggregate(total=Sum("amount"), count=Count("id"))
        by_category = (
            active.order_by()
            .values("category")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("-total")
        )
        labels = dict(Expense._meta.get_field("category").choices)
        return Response(
            {
                "total": selectors.money_str(totals["total"]),
                "count": totals["count"],
                "void_count": qs.filter(is_void=True).count(),
                "by_category": [
                    {
                        "category": row["category"],
                        "label": labels.get(row["category"], row["category"]),
                        "total": selectors.money_str(row["total"]),
                        "count": row["count"],
                    }
                    for row in by_category
                ],
            }
        )

    @action(detail=False, methods=["get"])
    def export(self, request):
        """Admin: the filtered expenses as CSV, or as an Excel workbook with `?file=xlsx`.

        `?project=<id>` gives one project's expenses (the Excel button on a project's budget card).
        """
        self._require_admin()
        qs = apply_expense_ordering(self._filtered(request), request.query_params.get("ordering"))
        rows = qs[: rules.EXPORT_MAX_ROWS]
        header = ["Date", "Project", "Category", "Vendor", "Description", "Amount", "Logged by"]
        header += ["Receipt", "Status", "Note"]

        def cells(e):
            return (
                e.spent_on.isoformat(),
                e.project.name,
                e.get_category_display(),
                e.vendor,
                e.description,
                selectors.money_str(e.amount),
                e.logged_by.display_name if e.logged_by else "",
                "Yes" if e.receipt else "No",
                "Void" if e.is_void else "Active",
                e.void_reason,
            )

        if (request.query_params.get("file") or "").lower() == "xlsx":
            return _xlsx_response(header, rows, cells)

        def stream():
            writer = csv.writer(_Echo())
            yield "﻿" + writer.writerow(header)
            for e in rows.iterator(chunk_size=500):
                yield writer.writerow([csv_safe(v) for v in cells(e)])

        response = StreamingHttpResponse(stream(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="expenses.csv"'
        return response


XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx_response(header, rows, cells) -> HttpResponse:
    """One sheet: a bold header, amounts as real numbers, and a total of the active expenses."""
    from decimal import Decimal

    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    sheet = wb.active
    sheet.title = "Expenses"
    sheet.append(header)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    total = Decimal("0")
    amount_col = header.index("Amount")
    for e in rows.iterator(chunk_size=500):
        values = [csv_safe(v) for v in cells(e)]
        values[amount_col] = e.amount  # a number Excel can sum, not text
        sheet.append(values)
        if not e.is_void:
            total += e.amount
    sheet.append([])
    sheet.append(["Total (active expenses)"] + [""] * (amount_col - 1) + [total])
    sheet.cell(row=sheet.max_row, column=1).font = Font(bold=True)
    for row in sheet.iter_rows(min_row=2, min_col=amount_col + 1, max_col=amount_col + 1):
        for cell in row:
            cell.number_format = "#,##0.00"
    widths = (12, 28, 14, 20, 36, 14, 18, 9, 9, 30)
    for column, width in zip("ABCDEFGHIJ", widths, strict=True):
        sheet.column_dimensions[column].width = width
    buffer = io.BytesIO()
    wb.save(buffer)
    response = HttpResponse(buffer.getvalue(), content_type=XLSX_TYPE)
    response["Content-Disposition"] = 'attachment; filename="expenses.xlsx"'
    return response


__all__ = ["ExpenseViewSet", "ProjectViewSet"]
