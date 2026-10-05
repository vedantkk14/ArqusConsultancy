"""Leads API. Every query starts from selectors.leads_for(user); execs only see own leads.

One row per lead (the client) carrying its CURRENT deal. Deal actions live under
/leads/{id}/opportunities/{opp_id}/...; the older lead-level actions (/leads/{id}/status, ...) are
kept as shortcuts that act on the lead's current deal.
"""

import csv
import io
from datetime import date, datetime, time

from django.contrib.auth import get_user_model
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.core.pagination import StandardPagination
from apps.core.permissions import HasRole

from . import importer, integrations, selectors, services
from .filters import SUMMARY_SKIP, apply_filters, apply_ordering
from .models import (
    CallScript,
    EmailTemplate,
    Interaction,
    MessageLog,
    Opportunity,
    WhatsAppTemplate,
)
from .serializers import (
    AssigneeSerializer,
    AssignSerializer,
    BulkAssignSerializer,
    CallLogSerializer,
    CallScriptSerializer,
    EmailSerializer,
    EmailTemplateSerializer,
    FinalizeSerializer,
    InteractionCreateSerializer,
    InteractionSerializer,
    LeadDetailSerializer,
    LeadExecUpdateSerializer,
    LeadListSerializer,
    LeadManagerUpdateSerializer,
    LeadWriteSerializer,
    MessageLogSerializer,
    OpportunityCreateSerializer,
    OpportunitySerializer,
    OpportunityUpdateSerializer,
    StatusChangeSerializer,
    WhatsAppSerializer,
    WhatsAppTemplateSerializer,
)
from .utils import InvalidPhone, csv_safe, normalize_phone

TEMPLATE_KINDS = {
    "whatsapp-templates": (WhatsAppTemplate, WhatsAppTemplateSerializer),
    "email-templates": (EmailTemplate, EmailTemplateSerializer),
    "call-scripts": (CallScript, CallScriptSerializer),
}
EXPORT_MAX_ROWS = 5000
EXPORT_COLUMNS = [
    ("name", "Name"),
    ("phone", "Phone"),
    ("email", "Email"),
    ("source_label", "Source"),
    ("status", "Status"),
    ("assigned_to_name", "Assigned to"),
    ("next_followup_at", "Next follow-up"),
    ("proposed_amount", "Proposed value"),
    ("deals_count", "Deals"),
    ("last_activity_at", "Last activity"),
    ("created_at", "Created"),
]
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
OPP_PATH = r"opportunities/(?P<opp_id>\d+)"


class _Echo:
    def write(self, value):
        return value


class _IgnoreFormatParam(DefaultContentNegotiation):
    """?format=xlsx|csv (the export) is ours, not DRF's renderer switch, which would answer 404."""

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


def _month_bounds(value: str | None) -> tuple[datetime, datetime, str]:
    """[start, end) of a "YYYY-MM" month in business time (default: this month)."""
    today = datetime.now(selectors.business_tz()).date()
    text = (value or "").strip() or f"{today:%Y-%m}"
    try:
        year, month = (int(p) for p in text.split("-"))
        first = date(year, month, 1)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"month": ["Use the form YYYY-MM, e.g. 2026-09."]}) from exc
    following = date(year + (month == 12), month % 12 + 1, 1)
    tz = selectors.business_tz()
    return (
        datetime.combine(first, time.min, tzinfo=tz),
        datetime.combine(following, time.min, tzinfo=tz),
        f"{first:%Y-%m}",
    )


def _interactions_count():
    count = (
        Interaction.objects.filter(opportunity__lead=OuterRef("pk"))
        .order_by()
        .values("opportunity__lead")
        .annotate(n=Count("id"))
        .values("n")
    )
    return Coalesce(Subquery(count, output_field=IntegerField()), Value(0))


class LeadViewSet(viewsets.GenericViewSet):
    permission_classes = [HasRole(*selectors.LIST_ROLES)]
    pagination_class = StandardPagination
    serializer_class = LeadListSerializer

    def get_queryset(self):
        return selectors.leads_for(self.request.user)

    def _is_manager(self) -> bool:
        return self.request.user.role in selectors.MANAGER_ROLES

    def _require_manager(self):
        if not self._is_manager():
            raise PermissionDenied()

    # ---- Deals ----------

    def _deals(self, lead):
        return (
            Opportunity.objects.filter(lead=lead)
            .select_related("lead", "assigned_to", "created_by")
            .order_by("-sequence_no")
        )

    def _deal(self, lead, opp_id) -> Opportunity:
        return get_object_or_404(self._deals(lead), pk=opp_id)

    def _current(self, lead) -> Opportunity:
        deal = services.current_opportunity(lead)
        if deal is None:
            raise ValidationError({"opportunity": ["This lead has no deal yet."]})
        return deal

    def _deal_rows(self, deals) -> list[dict]:
        """Serialized deals; project/ledger links and the finalized total only for managers."""
        rows = OpportunitySerializer(deals, many=True, context={"request": self.request}).data
        if not self._is_manager():
            return rows  # Exec: never a ledger, project or total key, not even null
        links = integrations.deal_links([row["id"] for row in rows])
        see_total = services.can_see_final_amount(self.request.user)
        for row in rows:
            link = links.get(row["id"], {})
            row["project_id"] = link.get("project_id")
            row["project_name"] = link.get("project_name")
            row["project_status"] = link.get("project_status")
            row["project_pm_name"] = link.get("project_pm_name")
            row["ledger_id"] = link.get("ledger_id")
            if see_total:
                row["finance"] = link.get("finance")
        return rows

    def _detail(self, lead) -> dict:
        lead = (
            selectors.with_list_annotations(self.get_queryset())
            .annotate(interactions_count=_interactions_count())
            .get(pk=lead.pk)
        )
        data = LeadDetailSerializer(lead, context={"request": self.request}).data
        data["opportunities"] = self._deal_rows(self._deals(lead))
        if services.can_see_final_amount(self.request.user):
            data["finance"] = integrations.finance_for(lead.current_opportunity)
        return data

    # ---- CRUD ----------

    def list(self, request):
        qs = apply_filters(
            selectors.with_list_annotations(self.get_queryset()), request.query_params
        )
        qs = apply_ordering(qs, request.query_params.get("ordering"))
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(
            LeadListSerializer(page, many=True, context={"request": request}).data
        )

    def create(self, request):
        if not services.can_create(request.user):
            raise PermissionDenied()
        serializer = LeadWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        force = str(request.data.get("force", "")).lower() in ("1", "true")
        lead = services.create_lead(dict(serializer.validated_data), request.user, force=force)
        return Response(self._detail(lead), status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        return Response(self._detail(self.get_object()))

    def partial_update(self, request, pk=None):
        lead = self.get_object()
        serializer_class = (
            LeadManagerUpdateSerializer if self._is_manager() else LeadExecUpdateSerializer
        )
        not_editable = set(request.data) - set(serializer_class.Meta.fields) - {"force"}
        if not_editable:
            raise ValidationError(
                {f: ["This field cannot be changed here."] for f in sorted(not_editable)}
            )
        serializer = serializer_class(lead, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if "phone" in data and data["phone"] != lead.phone:
            duplicate = services.find_duplicate(data["phone"], exclude_id=lead.id)
            if duplicate and str(request.data.get("force", "")).lower() not in ("1", "true"):
                from .exceptions import DuplicateLead

                raise DuplicateLead(existing=services.duplicate_summary(duplicate))
        services.update_lead(lead, data, request.user)
        return Response(self._detail(lead))

    def destroy(self, request, pk=None):
        services.soft_delete(self.get_object(), request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ---- Collections ----------

    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = apply_filters(self.get_queryset(), request.query_params, skip=SUMMARY_SKIP)
        return Response(selectors.summary(qs))

    @action(detail=False, methods=["get"], url_path="check-duplicate")
    def check_duplicate(self, request):
        self._require_manager()
        try:
            phone = normalize_phone(request.query_params.get("phone", ""))
        except InvalidPhone as exc:
            raise ValidationError({"phone": [str(exc)]}) from exc
        exclude = request.query_params.get("exclude")
        duplicate = services.find_duplicate(
            phone, exclude_id=int(exclude) if (exclude or "").isdigit() else None
        )
        return Response({"existing": services.duplicate_summary(duplicate) if duplicate else None})

    @action(detail=False, methods=["get"])
    def assignees(self, request):
        self._require_manager()
        rel = "assigned_opportunities"
        users = (
            get_user_model()
            .objects.filter(role__in=services.ASSIGNEE_ROLES, is_active=True)
            .annotate(
                open_count=Count(
                    rel,
                    filter=Q(**{f"{rel}__is_deleted": False}) & selectors.open_q(f"{rel}__"),
                )
            )
            .order_by("-role", "first_name", "username")
        )
        return Response(AssigneeSerializer(users, many=True).data)

    @action(detail=False, methods=["post"], url_path="bulk-assign")
    def bulk_assign(self, request):
        self._require_manager()
        serializer = BulkAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        count = services.bulk_assign(
            self.get_queryset(),
            serializer.validated_data["ids"],
            serializer.validated_data["assigned_to"],
            request.user,
        )
        return Response({"assigned": count})

    def _templates(self, request, kind):
        """GET lists the active ones; POST adds a new one (admins and sales managers only)."""
        model, serializer_class = TEMPLATE_KINDS[kind]
        if request.method == "POST":
            self._require_manager()
            serializer = serializer_class(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer_class(model.objects.filter(is_active=True), many=True).data)

    @action(detail=False, methods=["get", "post"], url_path="whatsapp-templates")
    def whatsapp_templates(self, request):
        return self._templates(request, "whatsapp-templates")

    @action(detail=False, methods=["get", "post"], url_path="email-templates")
    def email_templates(self, request):
        return self._templates(request, "email-templates")

    @action(detail=False, methods=["get", "post"], url_path="call-scripts")
    def call_scripts(self, request):
        return self._templates(request, "call-scripts")

    @action(
        detail=False,
        methods=["patch"],
        url_path=r"(?P<kind>whatsapp-templates|email-templates|call-scripts)/(?P<template_id>\d+)",
    )
    def edit_template(self, request, kind=None, template_id=None):
        """Admins and sales managers can reword a template or script at any time."""
        self._require_manager()
        model, serializer_class = TEMPLATE_KINDS[kind]
        template = get_object_or_404(model, pk=template_id)
        serializer = serializer_class(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def messages(self, request):
        """Cross-lead chat history (WhatsApp + Email), newest first."""
        services.sync_email_statuses()
        qs = MessageLog.objects.select_related(
            "opportunity__lead", "created_by", "template", "email_template"
        )
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(MessageLogSerializer(page, many=True).data)

    @action(detail=False, methods=["get"], content_negotiation_class=_IgnoreFormatParam)
    def export(self, request):
        """The filtered leads as an Excel workbook (default) or CSV (`?format=csv`).

        `?scope=all` (default) or `?scope=month&month=YYYY-MM`: leads created in that month.
        """
        self._require_manager()
        params = request.query_params
        qs = apply_filters(self.get_queryset(), params)
        label = "all"
        if params.get("scope") == "month":
            start, end, label = _month_bounds(params.get("month"))
            qs = qs.filter(created_at__gte=start, created_at__lt=end)
        elif params.get("scope") not in (None, "", "all"):
            raise ValidationError({"scope": ["Choose all or month."]})
        qs = apply_ordering(selectors.with_list_annotations(qs), params.get("ordering"))
        rows = qs[:EXPORT_MAX_ROWS]
        tz = selectors.business_tz()

        def value(lead, key):
            if key == "assigned_to_name":
                return lead.assigned_to.display_name if lead.assigned_to else ""
            if key == "source_label":
                return lead.source_other or lead.get_source_display()
            found = getattr(lead, key)
            if isinstance(found, datetime):
                return found.astimezone(tz).strftime("%Y-%m-%d %H:%M")
            return "" if found is None else found

        if (params.get("format") or "xlsx").lower() == "csv":

            def stream():
                writer = csv.writer(_Echo())
                yield "﻿" + writer.writerow([label for _, label in EXPORT_COLUMNS])
                for lead in rows.iterator(chunk_size=500):
                    yield writer.writerow([csv_safe(value(lead, key)) for key, _ in EXPORT_COLUMNS])

            response = StreamingHttpResponse(stream(), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="leads-{label}.csv"'
            return response
        return self._xlsx(rows, value, label)

    def _xlsx(self, rows, value, label) -> HttpResponse:
        from decimal import Decimal

        from openpyxl import Workbook
        from openpyxl.styles import Font

        book = Workbook()
        sheet = book.active
        sheet.title = "Leads"
        sheet.append([title for _, title in EXPORT_COLUMNS])
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for lead in rows.iterator(chunk_size=500):
            cells = []
            for key, _ in EXPORT_COLUMNS:
                found = value(lead, key)
                # Numbers stay numbers; any text goes through the formula-prefix guard.
                cells.append(found if isinstance(found, int | Decimal) else csv_safe(found))
            sheet.append(cells)
        amount_col = [k for k, _ in EXPORT_COLUMNS].index("proposed_amount") + 1
        for (cell,) in sheet.iter_rows(min_row=2, min_col=amount_col, max_col=amount_col):
            cell.number_format = "#,##0.00"
        widths = (24, 16, 26, 14, 12, 22, 17, 15, 7, 17, 17)
        for column, width in zip("ABCDEFGHIJK", widths, strict=True):
            sheet.column_dimensions[column].width = width
        sheet.freeze_panes = "A2"
        out = io.BytesIO()
        book.save(out)
        response = HttpResponse(out.getvalue(), content_type=XLSX_TYPE)
        response["Content-Disposition"] = f'attachment; filename="leads-{label}.xlsx"'
        return response

    @action(detail=False, methods=["post"], url_path="import", parser_classes=[MultiPartParser])
    def import_leads(self, request):
        """Create leads from an uploaded .xlsx/.csv. ?dry_run=1 only checks and reports."""
        if not services.can_create(request.user):
            raise PermissionDenied()
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": ["Choose a file to import."]})
        dry_run = str(request.query_params.get("dry_run", "")).lower() in ("1", "true")
        skip = str(request.data.get("skip_duplicates", "true")).lower() not in ("0", "false")
        report = importer.import_leads(upload, request.user, dry_run=dry_run, skip_duplicates=skip)
        return Response(report.as_dict())

    @action(detail=False, methods=["get"], url_path="import-template")
    def import_template(self, request):
        if not services.can_create(request.user):
            raise PermissionDenied()
        response = HttpResponse(importer.template_workbook(), content_type=XLSX_TYPE)
        response["Content-Disposition"] = 'attachment; filename="leads-import-template.xlsx"'
        return response

    # ---- One deal (shared by the lead-level shortcuts and the nested routes) ----------

    def _change_status(self, request, lead, deal):
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        services.change_status(deal, data.pop("status"), request.user, **data)
        return Response(self._detail(lead))

    def _interactions(self, request, deal):
        if request.method == "POST":
            serializer = InteractionCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = dict(serializer.validated_data)
            status_fields = {
                k: data.pop(k) for k in ("lost_reason", "lost_note", "proposed_amount") if k in data
            }
            interaction = services.log_interaction(
                deal,
                request.user,
                type_=data["type"],
                notes=data.get("notes", ""),
                next_followup_at=data.get("next_followup_at"),
                new_status=data.get("new_status"),
                status_fields=status_fields,
            )
            return Response(InteractionSerializer(interaction).data, status=status.HTTP_201_CREATED)
        qs = Interaction.objects.filter(opportunity=deal).select_related("created_by")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(InteractionSerializer(page, many=True).data)

    def _assign(self, request, lead, deal=None):
        self._require_manager()
        serializer = AssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if deal is None:
            services.assign(lead, serializer.validated_data["assigned_to"], request.user)
        else:
            services.assign_opportunity(
                deal, serializer.validated_data["assigned_to"], request.user
            )
        return Response(self._detail(lead))

    def _whatsapp(self, request, deal):
        """GET ?template_id= previews the message; POST logs it and returns the wa.me link."""
        source = request.query_params if request.method == "GET" else request.data
        serializer = WhatsAppSerializer(data=source)
        serializer.is_valid(raise_exception=True)
        template = get_object_or_404(
            WhatsAppTemplate, pk=serializer.validated_data["template_id"], is_active=True
        )
        if request.method == "GET":
            return Response(services.whatsapp_preview(deal, template, request.user))
        return Response(
            services.whatsapp(deal, template, request.user, serializer.validated_data.get("message"))
        )

    def _email(self, request, deal):
        """GET ?template_id= previews the email; POST queues it in django-mailer and logs it."""
        source = request.query_params if request.method == "GET" else request.data
        serializer = EmailSerializer(data=source)
        serializer.is_valid(raise_exception=True)
        template = get_object_or_404(
            EmailTemplate, pk=serializer.validated_data["template_id"], is_active=True
        )
        if request.method == "GET":
            return Response(services.email_preview(deal, template, request.user))
        return Response(
            services.email(deal, template, request.user, serializer.validated_data.get("message"))
        )

    def _call(self, request, deal):
        """Log a call, optionally noting which script was used as a reference."""
        serializer = CallLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        script = None
        if data.get("script_id"):
            script = get_object_or_404(CallScript, pk=data["script_id"], is_active=True)
        interaction = services.log_call(
            deal, request.user, script=script, notes=data.get("notes", "")
        )
        return Response(InteractionSerializer(interaction).data, status=status.HTTP_201_CREATED)

    def _finalize(self, request, lead, deal):
        if not services.can_finalize(request.user):
            raise PermissionDenied()
        serializer = FinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.finalize(
            deal,
            serializer.validated_data["amount"],
            request.user,
            serializer.validated_data.get("note", ""),
        )
        return Response(self._detail(lead))

    # ---- One lead: shortcuts acting on its current deal ----------

    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        lead = self.get_object()
        return self._change_status(request, lead, self._current(lead))

    @action(detail=True, methods=["get", "post"])
    def interactions(self, request, pk=None):
        lead = self.get_object()
        return self._interactions(request, self._current(lead))

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        self._require_manager()
        return self._assign(request, self.get_object())

    @action(detail=True, methods=["get", "post"])
    def whatsapp(self, request, pk=None):
        lead = self.get_object()
        return self._whatsapp(request, self._current(lead))

    @action(detail=True, methods=["get", "post"])
    def email(self, request, pk=None):
        lead = self.get_object()
        return self._email(request, self._current(lead))

    @action(detail=True, methods=["post"])
    def call(self, request, pk=None):
        lead = self.get_object()
        return self._call(request, self._current(lead))

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        if not services.can_finalize(request.user):
            raise PermissionDenied()
        lead = self.get_object()
        return self._finalize(request, lead, self._current(lead))

    # ---- One lead: its deals ----------

    @action(detail=True, methods=["get", "post"])
    def opportunities(self, request, pk=None):
        """GET: the lead's deals, newest first. POST: start a new deal (409 opportunity_open)."""
        lead = self.get_object()
        if request.method == "POST":
            serializer = OpportunityCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            deal = services.start_opportunity(
                lead,
                request.user,
                assigned_to=serializer.validated_data.get("assigned_to"),
                requirements=serializer.validated_data.get("requirements", ""),
                next_followup_at=serializer.validated_data.get("next_followup_at"),
            )
            deal = self._deal(lead, deal.pk)
            return Response(self._deal_rows([deal])[0], status=status.HTTP_201_CREATED)
        page = self.paginate_queryset(self._deals(lead))
        return self.get_paginated_response(self._deal_rows(page))

    @action(detail=True, methods=["get", "patch"], url_path=OPP_PATH)
    def opportunity(self, request, pk=None, opp_id=None):
        lead = self.get_object()
        deal = self._deal(lead, opp_id)
        if request.method == "PATCH":
            serializer = OpportunityUpdateSerializer(data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            services.update_opportunity(deal, dict(serializer.validated_data), request.user)
            deal = self._deal(lead, opp_id)
        return Response(self._deal_rows([deal])[0])

    @action(detail=True, methods=["post"], url_path=f"{OPP_PATH}/status")
    def opportunity_status(self, request, pk=None, opp_id=None):
        lead = self.get_object()
        return self._change_status(request, lead, self._deal(lead, opp_id))

    @action(detail=True, methods=["get", "post"], url_path=f"{OPP_PATH}/interactions")
    def opportunity_interactions(self, request, pk=None, opp_id=None):
        lead = self.get_object()
        return self._interactions(request, self._deal(lead, opp_id))

    @action(detail=True, methods=["post"], url_path=f"{OPP_PATH}/assign")
    def opportunity_assign(self, request, pk=None, opp_id=None):
        self._require_manager()
        lead = self.get_object()
        return self._assign(request, lead, self._deal(lead, opp_id))

    @action(detail=True, methods=["get", "post"], url_path=f"{OPP_PATH}/whatsapp")
    def opportunity_whatsapp(self, request, pk=None, opp_id=None):
        lead = self.get_object()
        return self._whatsapp(request, self._deal(lead, opp_id))

    @action(detail=True, methods=["post"], url_path=f"{OPP_PATH}/finalize")
    def opportunity_finalize(self, request, pk=None, opp_id=None):
        if not services.can_finalize(request.user):
            raise PermissionDenied()
        lead = self.get_object()
        return self._finalize(request, lead, self._deal(lead, opp_id))
