from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import InvoiceViewSet, SharedInvoiceView

router = SimpleRouter(trailing_slash=False)
router.register("invoices", InvoiceViewSet, basename="invoices")

urlpatterns = [
    path("invoices/shared/<str:token>", SharedInvoiceView.as_view(), name="invoice-shared"),
    *router.urls,
]
