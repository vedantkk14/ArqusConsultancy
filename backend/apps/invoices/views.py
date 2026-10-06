from django.conf import settings
from django.db.models import Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from apps.core.pagination import StandardPagination
from apps.core.permissions import ADMIN, HasRole

from . import services
from .models import Invoice
from .pdf import render_invoice_pdf
from .serializers import (
    EmailInvoiceSerializer,
    InvoiceDetailSerializer,
    InvoiceInputSerializer,
    InvoiceListSerializer,
    WhatsAppInvoiceSerializer,
)


def _pdf_response(invoice: Invoice, inline: bool) -> HttpResponse:
    response = HttpResponse(render_invoice_pdf(invoice), content_type="application/pdf")
    kind = "inline" if inline else "attachment"
    response["Content-Disposition"] = f'{kind}; filename="{services.filename(invoice)}"'
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


class InvoiceViewSet(GenericViewSet):
    """Invoices (admin only): list with search, make, edit, PDF, email and WhatsApp."""

    permission_classes = [HasRole(ADMIN)]
    pagination_class = StandardPagination
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        qs = Invoice.objects.prefetch_related("items")
        search = (self.request.query_params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(invoice_no__icontains=search)
                | Q(title__icontains=search)
                | Q(client_name__icontains=search)
            )
        return qs

    def _detail(self, invoice) -> dict:
        return InvoiceDetailSerializer(invoice).data

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(InvoiceListSerializer(page, many=True).data)

    def create(self, request):
        serializer = InvoiceInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = services.create_invoice(serializer.validated_data, request.user)
        return Response(self._detail(invoice), status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        return Response(self._detail(get_object_or_404(self.get_queryset(), pk=pk)))

    def partial_update(self, request, pk=None):
        invoice = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = InvoiceInputSerializer(invoice, data=request.data)
        serializer.is_valid(raise_exception=True)
        services.update_invoice(invoice, serializer.validated_data)
        return Response(self._detail(get_object_or_404(self.get_queryset(), pk=pk)))

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        invoice = get_object_or_404(self.get_queryset(), pk=pk)
        return _pdf_response(invoice, inline=request.query_params.get("download") != "1")

    @action(detail=True, methods=["post"])
    def email(self, request, pk=None):
        invoice = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = EmailInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sent_to = services.email_invoice(
            invoice,
            request.user,
            to=serializer.validated_data.get("to", ""),
            message=serializer.validated_data.get("message", ""),
        )
        return Response({"sent_to": sent_to, "invoice": self._detail(invoice)})

    @action(detail=True, methods=["post"])
    def whatsapp(self, request, pk=None):
        invoice = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = WhatsAppInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = services.make_token(invoice)
        base = settings.PUBLIC_API_URL.rstrip("/") or request.build_absolute_uri("/").rstrip("/")
        link = f"{base}/api/v1/invoices/shared/{token}"
        result = services.whatsapp_invoice(
            invoice, request.user, phone=serializer.validated_data.get("phone", ""), link=link
        )
        return Response({**result, "invoice": self._detail(invoice)})


class SharedInvoiceView(APIView):
    """The private PDF link in the WhatsApp message: signed, and good for 30 days."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invoice_share"

    def get(self, request, token):
        invoice = services.invoice_from_token(token)
        if invoice is None:
            raise Http404
        response = _pdf_response(invoice, inline=True)
        response["X-Robots-Tag"] = "noindex, nofollow"
        return response
