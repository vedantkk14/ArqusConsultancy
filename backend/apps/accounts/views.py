# ruff: noqa: E501
"""Accounts API. Admin only: every query starts from selectors.ledgers_for / payments_for."""

import csv
import io

from django.db.models import Q
from django.http import FileResponse, HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import status as http
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.core.pagination import StandardPagination
from apps.core.permissions import HasRole

from . import rules, selectors, services
from .filters import (
    LEDGER_SUMMARY_SKIP,
    apply_ledger_filters,
    apply_ledger_ordering,
    apply_payment_filters,
    apply_payment_ordering,
)
from .models import LedgerEvent, Payment, PaymentMode
from .serializers import (
    FinalizeSerializer,
    PaymentWriteSerializer,
    ReasonSerializer,
    ReviseSerializer,
    event_row,
    ledger_detail,
    ledger_row,
    payment_row,
)
from .utils import csv_safe, receipt_number


class _IgnoreFormatParam(DefaultContentNegotiation):
    """?format=csv (the statement) is ours, not DRF's renderer switch, which would answer 404."""

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


class _Echo:
    def write(self, value):
        return value


def _csv_response(name: str, header: list[str], rows) -> StreamingHttpResponse:
    def stream():
        writer = csv.writer(_Echo())
        yield "﻿" + writer.writerow(header)
        for row in rows:
            yield writer.writerow([csv_safe(v) for v in row])

    response = StreamingHttpResponse(stream(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{name}"'
    return response


class LedgerViewSet(GenericViewSet):
    content_negotiation_class = _IgnoreFormatParam
    permission_classes = [HasRole(*rules.ACCOUNTS_ROLES)]
    pagination_class = StandardPagination
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return selectors.with_figures(selectors.ledgers_for(self.request.user))

    def _ledger(self, pk):
        return get_object_or_404(self.get_queryset().select_related("finalized_by"), pk=pk)

    def _detail(self, pk) -> dict:
        return ledger_detail(self._ledger(pk))

    # ---- Collections ----------

    def list(self, request):
        qs = apply_ledger_ordering(
            apply_ledger_filters(self.get_queryset(), request.query_params),
            request.query_params.get("ordering"),
        )
        page = self.paginate_queryset(qs)
        today = selectors.business_today()
        return self.get_paginated_response([ledger_row(row, today) for row in page])

    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = apply_ledger_filters(
            self.get_queryset(), request.query_params, skip=LEDGER_SUMMARY_SKIP
        )
        return Response(selectors.summary(qs))

    @action(detail=False, methods=["get"])
    def options(self, request):
        """Finalized ledgers with a balance, for the record-payment select."""
        qs = self.get_queryset().filter(selectors.has_balance_q())
        if q := (request.query_params.get("q") or "").strip():
            qs = qs.filter(Q(lead__name__icontains=q) | Q(lead__phone__contains=q))
        rows = qs.order_by("lead__name", "id")[:10]
        return Response(
            [
                {
                    "id": r.pk,
                    "client": r.lead.name,
                    "phone": r.lead.phone,
                    "total": selectors.money_str(r.total_amount),
                    "outstanding": selectors.money_str(r.outstanding),
                }
                for r in rows
            ]
        )

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = apply_ledger_ordering(
            apply_ledger_filters(self.get_queryset(), request.query_params),
            request.query_params.get("ordering"),
        )[: rules.EXPORT_MAX_ROWS]
        today = selectors.business_today()
        header = [
            "Client",
            "Phone",
            "Executive",
            "State",
            "Total",
            "Received",
            "Outstanding",
            "Collected %",
        ]
        header += ["Days since", "Last payment", "Overdue"]

        def rows():
            for ledger in qs.iterator(chunk_size=500):
                r = ledger_row(ledger, today)
                yield [
                    r["client"], r["phone"], r["exec_name"] or "", r["state_label"], r["total"], r["received"],
                    r["outstanding"], r["collected_pct"], "" if r["days_since"] is None else r["days_since"],
                    r["last_payment_on"] or "", "Yes" if r["is_overdue"] else "No",
                ]  # fmt: skip

        return _csv_response("ledgers.csv", header, rows())

    # ---- One ledger ----------

    def retrieve(self, request, pk=None):
        return Response(self._detail(pk))

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        ledger = self._ledger(pk)
        serializer = FinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.finalize_ledger(
            ledger.lead,
            serializer.validated_data["amount"],
            request.user,
            serializer.validated_data.get("note", ""),
        )
        return Response(self._detail(pk))

    @action(detail=True, methods=["post"], url_path="revise-total")
    def revise_total(self, request, pk=None):
        ledger = self._ledger(pk)
        serializer = ReviseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.revise_total(
            ledger.pk,
            serializer.validated_data["amount"],
            serializer.validated_data["reason"],
            request.user,
        )
        return Response(self._detail(pk))

    @action(detail=True, methods=["post"])
    def reminder(self, request, pk=None):
        ledger = self._ledger(pk)
        return Response(services.send_reminder(ledger.pk, request.user))

    @action(detail=True, methods=["get", "post"])
    def payments(self, request, pk=None):
        ledger = self._ledger(pk)
        if request.method == "POST":
            serializer = PaymentWriteSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = dict(serializer.validated_data)
            upload = data.pop("proof", None)
            payment = services.add_payment(ledger.pk, request.user, data, upload)
            payment = selectors.payments_for(request.user).get(pk=payment.pk)
            return Response(payment_row(payment, with_balance=True), status=http.HTTP_201_CREATED)
        qs = selectors.payments_for(request.user).filter(ledger=ledger)
        qs = apply_payment_ordering(
            apply_payment_filters(qs, request.query_params), request.query_params.get("ordering")
        )
        page = self.paginate_queryset(qs)
        return self.get_paginated_response([payment_row(p) for p in page])

    @action(detail=True, methods=["get"])
    def events(self, request, pk=None):
        ledger = self._ledger(pk)
        page = self.paginate_queryset(
            LedgerEvent.objects.filter(ledger=ledger).select_related("actor")
        )
        return self.get_paginated_response([event_row(e) for e in page])

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        ledger = self._ledger(pk)
        date_from = parse_date(request.query_params.get("from") or "")
        date_to = parse_date(request.query_params.get("to") or "")
        if date_from and date_to and date_to < date_from:
            raise ValidationError({"to": ["The end date cannot be before the start date."]})
        if not ledger.finalized_at:
            raise ValidationError(
                {"non_field_errors": ["Finalize the deal amount before printing a statement."]}
            )
        statement = services.build_statement(ledger, date_from, date_to)
        if request.query_params.get("format") == "csv":
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            for row in services.statement_csv_rows(statement):
                writer.writerow(row)
            response = HttpResponse("﻿" + buffer.getvalue(), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = 'attachment; filename="statement.csv"'
            return response
        return Response(statement)


class PaymentViewSet(GenericViewSet):
    permission_classes = [HasRole(*rules.ACCOUNTS_ROLES)]
    pagination_class = StandardPagination
    lookup_value_regex = r"\d+"

    def get_queryset(self):
        return selectors.payments_for(self.request.user)

    def _filtered(self, request):
        return apply_payment_filters(self.get_queryset(), request.query_params)

    def _one(self, pk) -> dict:
        return payment_row(get_object_or_404(self.get_queryset(), pk=pk), with_balance=True)

    def list(self, request):
        qs = apply_payment_ordering(self._filtered(request), request.query_params.get("ordering"))
        page = self.paginate_queryset(qs)
        return self.get_paginated_response([payment_row(p) for p in page])

    def retrieve(self, request, pk=None):
        return Response(self._one(pk))

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        payment = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.void_payment(payment.pk, request.user, serializer.validated_data["reason"])
        return Response(self._one(pk))

    @action(detail=True, methods=["get"])
    def proof(self, request, pk=None):
        payment = get_object_or_404(self.get_queryset(), pk=pk)
        if not payment.proof:
            raise NotFound("This payment has no proof.")
        ext = payment.proof.name.rsplit(".", 1)[-1]
        response = FileResponse(
            payment.proof.open("rb"), content_type=payment.proof_type or "application/octet-stream"
        )
        response["Content-Disposition"] = (
            f'inline; filename="proof-{receipt_number(payment)}.{ext}"'
        )
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response

    @action(detail=False, methods=["get"])
    def summary(self, request):
        from django.db.models import Count, Sum

        qs = self._filtered(request)
        active = qs.filter(is_void=False)
        totals = active.aggregate(total=Sum("amount"), count=Count("id"))
        by_mode = (
            active.order_by()
            .values("mode")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("-total")
        )
        labels = dict(PaymentMode.choices)
        return Response(
            {
                "total": selectors.money_str(totals["total"]),
                "count": totals["count"],
                "void_count": qs.filter(is_void=True).count(),
                "by_mode": [
                    {
                        "mode": row["mode"],
                        "label": labels.get(row["mode"], row["mode"]),
                        "total": selectors.money_str(row["total"]),
                        "count": row["count"],
                    }
                    for row in by_mode
                ],
            }
        )

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = apply_payment_ordering(self._filtered(request), request.query_params.get("ordering"))[
            : rules.EXPORT_MAX_ROWS
        ]
        header = [
            "Receipt",
            "Date",
            "Client",
            "Amount",
            "Mode",
            "Reference",
            "Recorded by",
            "Proof",
            "Status",
            "Note",
        ]

        def rows():
            for p in qs.iterator(chunk_size=500):
                yield [
                    receipt_number(p), p.received_on.isoformat(), p.ledger.lead.name, selectors.money_str(p.amount),
                    p.get_mode_display(), p.reference, p.recorded_by.display_name if p.recorded_by else "",
                    "Yes" if p.proof else "No", "Void" if p.is_void else "Active", p.void_reason or p.note,
                ]  # fmt: skip

        return _csv_response("payments.csv", header, rows())


__all__ = ["LedgerViewSet", "Payment", "PaymentViewSet"]
