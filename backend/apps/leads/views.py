"""Leads API. Every query starts from selectors.leads_for(user); execs only see own leads."""

import csv

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.http import HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.core.pagination import StandardPagination
from apps.core.permissions import ADMIN, HasRole

from . import importer, integrations, selectors, services
from .filters import SUMMARY_SKIP, apply_filters, apply_ordering
from .models import Interaction, WhatsAppTemplate
from .serializers import (
    AssigneeSerializer,
    AssignSerializer,
    BulkAssignSerializer,
    FinalizeSerializer,
    InteractionCreateSerializer,
    InteractionSerializer,
    LeadDetailSerializer,
    LeadExecUpdateSerializer,
    LeadListSerializer,
    LeadManagerUpdateSerializer,
    LeadWriteSerializer,
    StatusChangeSerializer,
    WhatsAppSerializer,
    WhatsAppTemplateSerializer,
)
from .utils import InvalidPhone, csv_safe, normalize_phone

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
    ("created_at", "Created"),
]


class _Echo:
    def write(self, value):
        return value


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

    def _detail(self, lead) -> dict:
        lead = (
            self.get_queryset().annotate(interactions_count=Count("interactions")).get(pk=lead.pk)
        )
        data = LeadDetailSerializer(lead, context={"request": self.request}).data
        if services.can_see_final_amount(self.request.user):
            data["finance"] = integrations.finance_for(lead)
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
        users = (
            get_user_model()
            .objects.filter(role__in=services.ASSIGNEE_ROLES, is_active=True)
            .annotate(
                open_count=Count(
                    "assigned_leads",
                    filter=Q(assigned_leads__is_deleted=False)
                    & ~Q(assigned_leads__status__in=selectors.CLOSED_STATUSES),
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

    @action(detail=False, methods=["get"], url_path="whatsapp-templates")
    def whatsapp_templates(self, request):
        templates = WhatsAppTemplate.objects.filter(is_active=True)
        return Response(WhatsAppTemplateSerializer(templates, many=True).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        self._require_manager()
        qs = apply_filters(self.get_queryset(), request.query_params)
        qs = apply_ordering(
            selectors.with_list_annotations(qs), request.query_params.get("ordering")
        )
        rows = qs[:EXPORT_MAX_ROWS]

        def value(lead, key):
            if key == "assigned_to_name":
                return lead.assigned_to.display_name if lead.assigned_to else ""
            if key == "source_label":
                return lead.source_other or lead.get_source_display()
            return getattr(lead, key)

        def stream():
            writer = csv.writer(_Echo())
            yield "﻿" + writer.writerow([label for _, label in EXPORT_COLUMNS])
            for lead in rows.iterator(chunk_size=500):
                yield writer.writerow([csv_safe(value(lead, key)) for key, _ in EXPORT_COLUMNS])

        response = StreamingHttpResponse(stream(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="leads.csv"'
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
        response = HttpResponse(
            importer.template_workbook(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="leads-import-template.xlsx"'
        return response

    # ---- One lead ----------

    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        lead = self.get_object()
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        services.change_status(lead, data.pop("status"), request.user, **data)
        return Response(self._detail(lead))

    @action(detail=True, methods=["get", "post"])
    def interactions(self, request, pk=None):
        lead = self.get_object()
        if request.method == "POST":
            serializer = InteractionCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = dict(serializer.validated_data)
            status_fields = {
                k: data.pop(k) for k in ("lost_reason", "lost_note", "proposed_amount") if k in data
            }
            interaction = services.log_interaction(
                lead,
                request.user,
                type_=data["type"],
                notes=data.get("notes", ""),
                next_followup_at=data.get("next_followup_at"),
                new_status=data.get("new_status"),
                status_fields=status_fields,
            )
            return Response(InteractionSerializer(interaction).data, status=status.HTTP_201_CREATED)
        qs = Interaction.objects.filter(lead=lead).select_related("created_by")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(InteractionSerializer(page, many=True).data)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        self._require_manager()
        lead = self.get_object()
        serializer = AssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.assign(lead, serializer.validated_data["assigned_to"], request.user)
        return Response(self._detail(lead))

    @action(detail=True, methods=["get", "post"])
    def whatsapp(self, request, pk=None):
        """GET ?template_id= previews the message; POST logs it and returns the wa.me link."""
        lead = self.get_object()
        source = request.query_params if request.method == "GET" else request.data
        serializer = WhatsAppSerializer(data=source)
        serializer.is_valid(raise_exception=True)
        template = get_object_or_404(
            WhatsAppTemplate, pk=serializer.validated_data["template_id"], is_active=True
        )
        if request.method == "GET":
            return Response(services.whatsapp_preview(lead, template, request.user))
        return Response(services.whatsapp(lead, template, request.user))

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        if request.user.role != ADMIN:
            raise PermissionDenied()
        lead = self.get_object()
        serializer = FinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.finalize(
            lead,
            serializer.validated_data["amount"],
            request.user,
            serializer.validated_data.get("note", ""),
        )
        return Response(self._detail(lead))
