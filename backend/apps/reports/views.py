from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import ADMIN, SALES_MANAGER, HasRole, IsAdmin

from . import report_services as rs
from .serializers import AdminDashboardSerializer, DashboardQuerySerializer, ReportQuerySerializer
from .services import build_admin_dashboard


class AdminDashboardView(APIView):
    """KPIs, trends and lists for the admin home. ?period=month|quarter|year|all (default month)."""

    permission_classes = [IsAdmin]

    @extend_schema(parameters=[DashboardQuerySerializer], responses=AdminDashboardSerializer)
    def get(self, request):
        query = DashboardQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response(build_admin_dashboard(query.validated_data["period"]))


class _ReportView(APIView):
    """Shared by the four reports: validate the period, build, then JSON or (?export=csv) a file."""

    permission_classes = [HasRole(ADMIN)]
    slug = ""
    csv_writer = None

    def build(self, period, today):
        raise NotImplementedError

    @extend_schema(parameters=[ReportQuerySerializer])
    def get(self, request):
        query = ReportQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        v = query.validated_data
        today = rs.business_today()
        period = rs.resolve_period(v["period"], v.get("from_"), v.get("to"), today)
        data = self.build(period, today)
        if v.get("export") == "csv":
            response = HttpResponse(
                type(self).csv_writer(data), content_type="text/csv; charset=utf-8"
            )
            response["Content-Disposition"] = (
                f'attachment; filename="{self.slug}-{today.isoformat()}.csv"'
            )
            return response
        return Response(data)


class SalesReportView(_ReportView):
    """Per-executive leads, wins and commission. Admin and Sales Manager."""

    permission_classes = [HasRole(ADMIN, SALES_MANAGER)]
    slug = "sales"
    csv_writer = staticmethod(rs.sales_csv)

    def build(self, period, today):
        return rs.build_sales(period)


class FinancialReportView(_ReportView):
    slug = "financial-health"
    csv_writer = staticmethod(rs.financial_csv)

    def build(self, period, today):
        return rs.build_financial(period, today)


class ProjectMarginReportView(_ReportView):
    slug = "project-margin"
    csv_writer = staticmethod(rs.margin_csv)

    def build(self, period, today):
        return rs.build_project_margin(period)


class LeadFunnelReportView(_ReportView):
    slug = "lead-funnel"
    csv_writer = staticmethod(rs.funnel_csv)

    def build(self, period, today):
        return rs.build_lead_funnel(period)
