from django.urls import path

from .views import AuditLogView, AuditModelsView, HealthView, MasterDataView

urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("core/master-data", MasterDataView.as_view(), name="master-data"),
    path("core/audit-log", AuditLogView.as_view(), name="audit-log"),
    path("core/audit-log/models", AuditModelsView.as_view(), name="audit-log-models"),
]
