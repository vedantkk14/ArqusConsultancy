from django.urls import path

from .views import (
    AdminDashboardView,
    FinancialReportView,
    LeadFunnelReportView,
    ProjectMarginReportView,
    SalesReportView,
)

urlpatterns = [
    path("dashboard/admin", AdminDashboardView.as_view(), name="dashboard-admin"),
    path("reports/sales", SalesReportView.as_view(), name="report-sales"),
    path("reports/financial", FinancialReportView.as_view(), name="report-financial"),
    path("reports/project-margin", ProjectMarginReportView.as_view(), name="report-project-margin"),
    path("reports/lead-funnel", LeadFunnelReportView.as_view(), name="report-lead-funnel"),
]
