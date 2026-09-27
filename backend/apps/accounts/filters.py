# ruff: noqa: E501
"""List filters. Query names are a contract with the dashboard links (see docs/API_CONTRACT.md)."""

import re
from datetime import datetime, time, timedelta

from django.db.models import F, Q, QuerySet
from django.utils.dateparse import parse_date

from . import selectors
from .models import LedgerState, PaymentMode

TRUE = {"1", "true", "yes"}

LEDGER_ORDERINGS = {
    "client": [F("lead__name").asc()],
    "-outstanding": [F("outstanding").desc()],
    "outstanding": [F("outstanding").asc()],
    "-total": [F("total_amount").desc()],
    "total": [F("total_amount").asc()],
    "-received": [F("received").desc()],
    "-days_since": [F("aging_base").asc(nulls_last=True)],  # longest waiting first
    "-last_payment_on": [F("last_payment_on").desc(nulls_last=True)],
    "-created_at": [F("created_at").desc()],
    "created_at": [F("created_at").asc()],
}
DEFAULT_LEDGER_ORDERING = "-created_at"

PAYMENT_ORDERINGS = {
    "-received_on": [F("received_on").desc(), F("id").desc()],
    "received_on": [F("received_on").asc(), F("id").asc()],
    "-amount": [F("amount").desc()],
    "amount": [F("amount").asc()],
    "-created_at": [F("created_at").desc()],
}
DEFAULT_PAYMENT_ORDERING = "-received_on"

LEDGER_SUMMARY_SKIP = ("state", "overdue", "finalized", "has_balance", "aging")


def _flag(params, key) -> bool:
    return (params.get(key) or "").lower() in TRUE


def _day_start(value: str):
    day = parse_date(value or "")
    return datetime.combine(day, time.min, tzinfo=selectors.business_tz()) if day else None


def apply_ledger_filters(qs: QuerySet, params, skip: tuple[str, ...] = ()) -> QuerySet:
    """`qs` must come from selectors.with_figures. Unknown or malformed values are ignored."""
    get = params.get
    if "state" not in skip and get("state"):
        wanted = [s for s in get("state").upper().split(",") if s in LedgerState.values]
        if wanted:
            cond = Q()
            for state in wanted:
                cond |= selectors.state_q(state)
            qs = qs.filter(cond)
    if q := (get("q") or "").strip():
        cond = Q(lead__name__icontains=q) | Q(lead__email__icontains=q)
        digits = re.sub(r"\D", "", q)
        if len(digits) >= 3:
            cond |= Q(lead__phone__contains=digits)
        qs = qs.filter(cond)
    if "overdue" not in skip and _flag(params, "overdue"):
        qs = qs.filter(selectors.overdue_q())
    if "finalized" not in skip and (get("finalized") or "").lower() in ("true", "false"):
        qs = qs.filter(finalized_at__isnull=get("finalized").lower() != "true")
    if "has_balance" not in skip and _flag(params, "has_balance"):
        qs = qs.filter(selectors.has_balance_q())
    bucket = (get("aging") or "").replace(" ", "+")
    if "aging" not in skip and bucket in selectors.AGING_BUCKETS:
        qs = qs.filter(selectors.aging_q(bucket))
    if start := _day_start(get("created_from")):
        qs = qs.filter(created_at__gte=start)
    if start := _day_start(get("created_to")):
        qs = qs.filter(created_at__lt=start + timedelta(days=1))
    return qs


def apply_ledger_ordering(qs: QuerySet, value: str | None) -> QuerySet:
    key = value if value in LEDGER_ORDERINGS else DEFAULT_LEDGER_ORDERING
    return qs.order_by(*LEDGER_ORDERINGS[key], "-id")


def apply_payment_filters(qs: QuerySet, params) -> QuerySet:
    get = params.get
    if (get("ledger") or "").isdigit():
        qs = qs.filter(ledger_id=int(get("ledger")))
    if get("mode"):
        wanted = [m for m in get("mode").upper().split(",") if m in PaymentMode.values]
        if wanted:
            qs = qs.filter(mode__in=wanted)
    if q := (get("q") or "").strip():
        qs = qs.filter(
            Q(reference__icontains=q) | Q(ledger__lead__name__icontains=q) | Q(note__icontains=q)
        )
    if day := parse_date(get("date_from") or ""):
        qs = qs.filter(received_on__gte=day)
    if day := parse_date(get("date_to") or ""):
        qs = qs.filter(received_on__lte=day)
    if (get("has_proof") or "").lower() in TRUE:
        qs = qs.exclude(proof="")
    elif (get("has_proof") or "").lower() in ("0", "false", "no"):
        qs = qs.filter(proof="")
    if get("state") == "active":
        qs = qs.filter(is_void=False)
    elif get("state") == "void":
        qs = qs.filter(is_void=True)
    return qs


def apply_payment_ordering(qs: QuerySet, value: str | None) -> QuerySet:
    key = value if value in PAYMENT_ORDERINGS else DEFAULT_PAYMENT_ORDERING
    return qs.order_by(*PAYMENT_ORDERINGS[key])
