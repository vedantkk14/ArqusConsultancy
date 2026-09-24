from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAdmin

from .serializers import AdminDashboardSerializer, DashboardQuerySerializer
from .services import build_admin_dashboard


class AdminDashboardView(APIView):
    """KPIs, trends and lists for the admin home. ?period=month|quarter|year|all (default month)."""

    permission_classes = [IsAdmin]

    @extend_schema(parameters=[DashboardQuerySerializer], responses=AdminDashboardSerializer)
    def get(self, request):
        query = DashboardQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response(build_admin_dashboard(query.validated_data["period"]))
