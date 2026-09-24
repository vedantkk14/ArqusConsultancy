from rest_framework.routers import SimpleRouter

from .views import LeadViewSet

router = SimpleRouter(trailing_slash=False)
router.register("leads", LeadViewSet, basename="leads")

urlpatterns = router.urls
