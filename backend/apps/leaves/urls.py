from rest_framework.routers import SimpleRouter

from .views import HolidayViewSet, LeaveRequestViewSet

router = SimpleRouter(trailing_slash=False)
router.register("leaves", LeaveRequestViewSet, basename="leaves")
router.register("holidays", HolidayViewSet, basename="holidays")

urlpatterns = router.urls
