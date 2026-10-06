from django.urls import path
from rest_framework.routers import SimpleRouter

from .dashboard_pm_views import PMDashboardView
from .views import ClientViewSet, ExpenseViewSet, ProjectViewSet

router = SimpleRouter(trailing_slash=False)
router.register("projects", ProjectViewSet, basename="projects")
router.register("clients", ClientViewSet, basename="clients")
router.register("expenses", ExpenseViewSet, basename="expenses")

urlpatterns = [
    path("dashboard/pm", PMDashboardView.as_view(), name="dashboard-pm"),
    *router.urls,
]
