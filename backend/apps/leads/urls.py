from django.urls import path
from rest_framework.routers import SimpleRouter

from .dashboard_exec_views import SalesExecDashboardView
from .dashboard_manager_views import SalesManagerDashboardView
from .views import LeadViewSet

router = SimpleRouter(trailing_slash=False)
router.register("leads", LeadViewSet, basename="leads")

urlpatterns = router.urls + [
    path(
        "dashboard/sales-manager",
        SalesManagerDashboardView.as_view(),
        name="dashboard-sales-manager",
    ),
    path(
        "dashboard/sales-exec",
        SalesExecDashboardView.as_view(),
        name="dashboard-sales-exec",
    ),
]
