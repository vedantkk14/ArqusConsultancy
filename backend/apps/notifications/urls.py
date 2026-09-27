from apps.core.routers import OptionalSlashRouter

from .views import NotificationViewSet

# The slash is optional: /notifications and /notifications/ both work.
router = OptionalSlashRouter()
router.register("notifications", NotificationViewSet, basename="notifications")

urlpatterns = router.urls
