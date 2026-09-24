# ruff: noqa: E501
from rest_framework.routers import SimpleRouter

from .views import LedgerViewSet, PaymentViewSet

router = SimpleRouter(trailing_slash=False)
router.register("ledgers", LedgerViewSet, basename="ledgers")
router.register("payments", PaymentViewSet, basename="payments")

urlpatterns = router.urls
