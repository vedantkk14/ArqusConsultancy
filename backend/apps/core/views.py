from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils.dateparse import parse_date
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .master_data import build_master_data
from .models import AuditLog
from .pagination import StandardPagination
from .permissions import IsAdmin
from .serializers import AuditLogSerializer


class HealthView(APIView):
    """Public liveness check for load balancers and the mobile app."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


class MasterDataView(APIView):
    """GET /api/v1/core/master-data: the reference lists defined in code (Admin only, read-only)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        return Response({"lists": build_master_data()})


class AuditLogView(GenericAPIView):
    """GET /core/audit-log: model_label, actor, action, from, to (YYYY-MM-DD, IST), q."""

    permission_classes = [IsAdmin]
    pagination_class = StandardPagination
    serializer_class = AuditLogSerializer

    def get(self, request):
        qs = AuditLog.objects.select_related("actor")
        p = request.query_params
        if p.get("model_label"):
            qs = qs.filter(model_label=p["model_label"])
        if (p.get("actor") or "").isdigit():
            qs = qs.filter(actor_id=int(p["actor"]))
        if p.get("action", "").upper() in AuditLog.Action.values:
            qs = qs.filter(action=p["action"].upper())
        tz = ZoneInfo(getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata"))
        if start := parse_date(p.get("from") or ""):
            qs = qs.filter(created_at__gte=datetime.combine(start, time.min, tzinfo=tz))
        if end := parse_date(p.get("to") or ""):
            qs = qs.filter(
                created_at__lt=datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz)
            )
        if q := (p.get("q") or "").strip():
            qs = qs.filter(object_repr__icontains=q)
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(AuditLogSerializer(page, many=True).data)


class AuditModelsView(APIView):
    """The model labels that have audit rows (fills the filter dropdown)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        labels = AuditLog.objects.order_by().values_list("model_label", flat=True).distinct()
        return Response(sorted(labels))
