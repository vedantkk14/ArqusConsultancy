"""Projects and expenses API. Every query starts from selectors.projects_for / expenses_for."""

import csv
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Prefetch, Q, Sum
from django.http import FileResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status as http
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.core.pagination import StandardPagination
from apps.core.permissions import ADMIN, PROJECT_MANAGER, HasRole

from . import integrations, rules, selectors, services
from .filters import (
    PROJECT_SUMMARY_SKIP,
    apply_expense_filters,
    apply_expense_ordering,
    apply_project_filters,
    apply_project_ordering,
)
from .models import AlertState, BudgetRequest, Expense, ProjectEvent, ProjectStatus
from .serializers import (
    AlertSerializer,
    AssignPMSerializer,
    BudgetSerializer,
    ConvertSerializer,
    EventSerializer,
    ExpenseWriteSerializer,
    ProjectUpdateSerializer,
    ReasonSerializer,
    expense_serializer,
    project_serializer,
)

ROLES = (ADMIN, PROJECT_MANAGER)
INELIGIBLE_MAX = 200


def _money_field(value) -> Decimal:
    from decimal import InvalidOperation

    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise ValidationError({"amount": ["Enter an amount, e.g. 25000."]}) from None
    if amount != amount.quantize(Decimal("0.01")) or amount.as_tuple().exponent < -2:
        raise ValidationError({"amount": ["Use at most two decimals."]})
    return amount


class _Echo:
    def write(self, value):
        return value


def csv_safe(value) -> str:
    """Neutralise spreadsheet formulas: prefix cells starting with = + - @ with an apostrophe."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


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
        pending = Prefetch(
            "budget_requests",
            queryset=BudgetRequest.objects.filter(status="PENDING").select_related("requested_by"),
            to_attr="pending_requests",
        )
        qs = selectors.budget_usage_qs(selectors.projects_for(self.request.user))
        if (self.request.query_params.get("budget_request") or "") == "pending":
            qs = qs.filter(budget_requests__status="PENDING").distinct()
        return qs.prefetch_related(pending)

    def _require_admin(self):
        if self.request.user.role != ADMIN:
            raise PermissionDenied()

    def _project(self, pk):
        return get_object_or_404(self.get_queryset().select_related("lead"), pk=pk)

    def _detail(self, pk) -> dict:
        project = self._project(pk)
        cls = project_serializer(self.request.user, detail=True)
        return cls(project, context={"request": self.request}).data

    # ---- Collections ----------

    def list(self, request):
        qs = apply_project_filters(self.get_queryset(), request.query_params)
        qs = apply_project_ordering(qs, request.query_params.get("ordering"))
        page = self.paginate_queryset(qs)
        cls = project_serializer(request.user)
        return self.get_paginated_response(cls(page, many=True, context={"request": request}).data)

    def create(self, request):
        self._require_admin()
        serializer = ConvertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        project = services.convert(
            data["lead"],
            name=data["name"],
            sanctioned_budget=data["sanctioned_budget"],
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
        qs = apply_project_filters(
            self.get_queryset(), request.query_params, skip=PROJECT_SUMMARY_SKIP
        )
        wanted = (request.query_params.get("status") or "").upper()
        data = selectors.project_summary(
            qs, wanted if wanted in ProjectStatus.values else ProjectStatus.RUNNING
        )
        if request.user.role != ADMIN:
            data.pop("no_pm")
        return Response(data)

    @action(detail=False, methods=["get"])
    def convertible(self, request):
        """Won deals that can become projects. `?lead=<id>` looks one up and says why not."""
        self._require_admin()
        lead_model = integrations.lead_model()
        wanted = request.query_params.get("lead", "")
        if wanted.isdigit():
            leads = list(lead_model.objects.filter(pk=int(wanted)).select_related("assigned_to"))
        else:
            leads = list(
                lead_model.objects.filter(status="WON", project__isnull=True)
                .select_related("assigned_to")
                .order_by("won_at", "id")[:INELIGIBLE_MAX]
            )
        from .models import Project

        existing = dict(
            Project.objects.filter(lead_id__in=[lead.pk for lead in leads]).values_list(
                "lead_id", "id"
            )
        )
        rows = []
        for lead in leads:
            if lead.pk in existing:
                reason = "project_exists"
            elif lead.status != "WON":
                reason = "not_won"
            else:
                reason = integrations.finalization_problem(lead)
            if reason and not wanted:
                continue
            total = integrations.deal_total(lead)
            rows.append(
                {
                    "lead": lead.pk,
                    "name": lead.name,
                    "exec_name": lead.assigned_to.display_name if lead.assigned_to else None,
                    "won_at": lead.won_at,
                    "proposed_amount": selectors.money_str(lead.proposed_amount)
                    if lead.proposed_amount is not None
                    else None,
                    "total_amount": None if total is None else selectors.money_str(total),
                    "suggested_budget": selectors.suggested_budget(total),
                    "ineligible_reason": reason,
                    "project_id": existing.get(lead.pk),
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

    @action(detail=True, methods=["post"])
    def budget(self, request, pk=None):
        self._require_admin()
        project = self._project(pk)
        serializer = BudgetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.change_budget(
            project.pk,
            serializer.validated_data["sanctioned_budget"],
            serializer.validated_data["reason"],
            request.user,
        )
        return Response(self._detail(project.pk))

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
        project = self._project(pk)
        services.complete(project.pk, request.user)
        return Response(self._detail(project.pk))

    @action(detail=True, methods=["post"], url_path="budget-request")
    def budget_request(self, request, pk=None):
        """PM: ask for more budget. Body: amount (extra, not the new total), reason."""
        project = self._project(pk)
        amount = _money_field(request.data.get("amount"))
        services.request_budget(
            project.pk, request.user, amount, str(request.data.get("reason", ""))
        )
        return Response(self._detail(project.pk), status=http.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="budget-request/decide")
    def decide_budget_request(self, request, pk=None):
        """Admin: approve or reject the pending request. Body: approve (bool), note."""
        self._require_admin()
        project = self._project(pk)
        approve = str(request.data.get("approve", "")).lower() in ("1", "true")
        services.decide_budget_request(
            project.pk, request.user, approve, str(request.data.get("note", ""))
        )
        return Response(self._detail(project.pk))

    @action(detail=True, methods=["post"], url_path="release-budget")
    def release_budget(self, request, pk=None):
        """Admin, completed project under budget: keep the unused part as margin, or move it."""
        self._require_admin()
        project = self._project(pk)
        result = services.release_budget(
            project.pk, request.user, request.data.get("target_project") or None
        )
        return Response({**result, "project": self._detail(project.pk)})

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
        return self.get_paginated_response(EventSerializer(page, many=True).data)

    @action(detail=True, methods=["get", "post"])
    def expenses(self, request, pk=None):
        project = self._project(pk)
        user = request.user
        if request.method == "POST":
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
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        data, upload = _expense_input(request, partial=True)
        services.edit_expense(expense.pk, request.user, data, upload)
        return Response(self._one(expense.pk))

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.void_expense(expense.pk, request.user, serializer.validated_data["reason"])
        return Response(self._one(expense.pk))

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
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
    def alerts(self, request):
        self._require_admin()
        qs = selectors.budget_usage_qs(selectors.projects_for(request.user)).filter(
            status=ProjectStatus.RUNNING
        )
        qs = qs.exclude(selectors.state_q("ok")).order_by("-usage", "-id")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(AlertSerializer(page, many=True).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        self._require_admin()
        qs = apply_expense_ordering(self._filtered(request), request.query_params.get("ordering"))
        rows = qs[: rules.EXPORT_MAX_ROWS]
        header = ["Date", "Project", "Category", "Vendor", "Description", "Amount", "Logged by"]
        header += ["Receipt", "Status", "Note"]

        def status_of(expense):
            if expense.is_void:
                return "Void"
            return "Override" if expense.is_override else "Active"

        def stream():
            writer = csv.writer(_Echo())
            yield "﻿" + writer.writerow(header)
            for e in rows.iterator(chunk_size=500):
                yield writer.writerow(
                    [
                        csv_safe(v)
                        for v in (
                            e.spent_on.isoformat(),
                            e.project.name,
                            e.get_category_display(),
                            e.vendor,
                            e.description,
                            selectors.money_str(e.amount),
                            e.logged_by.display_name if e.logged_by else "",
                            "Yes" if e.receipt else "No",
                            status_of(e),
                            e.void_reason or e.override_reason,
                        )
                    ]
                )

        response = StreamingHttpResponse(stream(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="expenses.csv"'
        return response


__all__ = ["AlertState", "ExpenseViewSet", "ProjectViewSet"]
