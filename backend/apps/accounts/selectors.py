# ruff: noqa: E501
"""Read side of accounts: ledger state, overdue and aging, role scoping and aggregates.

Dev C's Reports should import these instead of re-deriving them, so every screen agrees:
`with_figures`, `overdue_q`, `aging_q`, `aging_buckets`, `collection_rate`, `ledger_state`, `PAYMENT_OVERDUE_DAYS`.
Only FINALIZED ledgers count in outstanding, collection rate and aging.
"""

from datetime import date, datetime, timedelta
from decimal import ROUND_DOWN, Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import (
    DateField,
    DecimalField,
    ExpressionWrapper,
    F,
    Max,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from . import rules
from .models import Ledger, LedgerState, Payment

PAYMENT_OVERDUE_DAYS = rules.PAYMENT_OVERDUE_DAYS
AGING_BUCKETS = rules.AGING_BUCKETS
MONEY = DecimalField(max_digits=14, decimal_places=2)
ZERO = Decimal("0.00")


def now() -> datetime:
    """The current moment. Tests patch this to move the clock."""
    return timezone.now()


def business_tz() -> ZoneInfo:
    return ZoneInfo(getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata"))


def business_date(moment: datetime | None = None) -> date:
    return (moment or now()).astimezone(business_tz()).date()


def business_today() -> date:
    return business_date()


def money_str(value) -> str:
    return f"{Decimal(value or 0):.2f}"


# ---- Definitions ----------


def ledger_state(total, received, finalized: bool) -> str:
    """AWAITING_FINALIZATION, UNPAID, PARTIAL or PAID."""
    if not finalized:
        return LedgerState.AWAITING_FINALIZATION
    total, received = Decimal(total or 0), Decimal(received or 0)
    if received <= 0:
        return LedgerState.UNPAID
    return LedgerState.PAID if received >= total else LedgerState.PARTIAL


def days_since(base: date | None, today: date | None = None) -> int | None:
    """Whole business days since `base` (the last active payment, else the finalization date)."""
    return None if base is None else ((today or business_today()) - base).days


def is_overdue(finalized: bool, outstanding, base: date | None, today: date | None = None) -> bool:
    days = days_since(base, today)
    return bool(
        finalized
        and Decimal(outstanding or 0) > 0
        and days is not None
        and days > PAYMENT_OVERDUE_DAYS
    )


def bucket_for(days: int) -> str:
    if days <= 30:
        return "0-30"
    if days <= 60:
        return "31-60"
    if days <= 90:
        return "61-90"
    return "90+"


# ---- Querysets ----------


def ledgers_for(user) -> QuerySet:
    """Every ledger query starts here. Only an Admin ever sees ledgers."""
    if user.role in rules.ACCOUNTS_ROLES:
        return Ledger.objects.select_related("lead", "lead__assigned_to")
    return Ledger.objects.none()


def payments_for(user) -> QuerySet:
    if user.role in rules.ACCOUNTS_ROLES:
        return Payment.objects.select_related("ledger", "ledger__lead", "recorded_by")
    return Payment.objects.none()


def active_payments() -> QuerySet:
    return Payment.objects.filter(is_void=False)


def with_figures(qs: QuerySet | None = None) -> QuerySet:
    """Annotate ledgers with `received`, `outstanding`, `last_payment_on` and `aging_base`."""
    active = active_payments().filter(ledger=OuterRef("pk")).order_by().values("ledger")
    qs = Ledger.objects.all() if qs is None else qs
    return qs.annotate(
        received=Coalesce(
            Subquery(active.annotate(t=Sum("amount")).values("t"), output_field=MONEY),
            Value(ZERO),
            output_field=MONEY,
        ),
        last_payment_on=Subquery(
            active.annotate(d=Max("received_on")).values("d"), output_field=DateField()
        ),
    ).annotate(
        outstanding=ExpressionWrapper(F("total_amount") - F("received"), output_field=MONEY),
        aging_base=Coalesce("last_payment_on", "finalized_on", output_field=DateField()),
    )


def state_q(state: str) -> Q:
    finalized = Q(finalized_at__isnull=False)
    if state == LedgerState.AWAITING_FINALIZATION:
        return Q(finalized_at__isnull=True)
    if state == LedgerState.PAID:
        return finalized & Q(received__gte=F("total_amount"), received__gt=0)
    if state == LedgerState.PARTIAL:
        return finalized & Q(received__gt=0, received__lt=F("total_amount"))
    return finalized & Q(received__lte=0)  # UNPAID


def has_balance_q() -> Q:
    return Q(finalized_at__isnull=False, outstanding__gt=0)


def overdue_q(today: date | None = None) -> Q:
    """Finalized, a balance left, and more than PAYMENT_OVERDUE_DAYS since the aging base."""
    today = today or business_today()
    return has_balance_q() & Q(aging_base__lte=today - timedelta(days=PAYMENT_OVERDUE_DAYS + 1))


def aging_q(bucket: str, today: date | None = None) -> Q:
    today = today or business_today()
    low, high = {"0-30": (0, 30), "31-60": (31, 60), "61-90": (61, 90), "90+": (91, None)}[bucket]
    q = has_balance_q() & Q(aging_base__lte=today - timedelta(days=low))
    return q & Q(aging_base__gte=today - timedelta(days=high)) if high is not None else q


def received_for(ledger) -> Decimal:
    total = active_payments().filter(ledger=ledger).aggregate(t=Sum("amount"))["t"]
    return total or ZERO


def balance_after(payment) -> Decimal | None:
    """Outstanding right after this payment (None for a void payment)."""
    if payment.is_void:
        return None
    earlier = (
        active_payments()
        .filter(ledger_id=payment.ledger_id)
        .filter(
            Q(received_on__lt=payment.received_on)
            | Q(received_on=payment.received_on, id__lte=payment.id)
        )
    )
    return payment.ledger.total_amount - (earlier.aggregate(t=Sum("amount"))["t"] or ZERO)


# ---- Aggregates (Python over annotated rows: MySQL cannot aggregate a subquery alias) ----------


def aging_buckets(rows) -> list[dict]:
    """`rows`: (outstanding, aging_base) of finalized ledgers. Only rows with a balance count."""
    today = business_today()
    out = {name: {"bucket": name, "count": 0, "amount": ZERO} for name in AGING_BUCKETS}
    for outstanding, base in rows:
        if Decimal(outstanding) > 0 and base is not None:
            slot = out[bucket_for(days_since(base, today))]
            slot["count"] += 1
            slot["amount"] += Decimal(outstanding)
    return [{**b, "amount": money_str(b["amount"])} for b in out.values()]


def collection_rate(total_value, received) -> str:
    """All received / all finalized total, as a percentage string with one decimal (cut, not rounded up)."""
    total_value = Decimal(total_value or 0)
    if total_value <= 0:
        return "0.0"
    pct = (Decimal(received or 0) * 100 / total_value).quantize(Decimal("0.1"), rounding=ROUND_DOWN)
    return f"{pct:.1f}"


def summary(qs: QuerySet) -> dict:
    """`qs` is with_figures() and already scoped. Numbers only ever come from finalized ledgers."""
    today = business_today()
    total_value = received = outstanding = overdue_amount = ZERO
    clients_with_balance = overdue_clients = awaiting = 0
    counts = {s.value: 0 for s in LedgerState}
    aging_rows, overdue_rows = [], []
    for ledger_id, name, total, rec, out, base, finalized_at in qs.order_by().values_list(
        "id", "lead__name", "total_amount", "received", "outstanding", "aging_base", "finalized_at"
    ):
        finalized = finalized_at is not None
        counts[ledger_state(total, rec, finalized)] += 1
        if not finalized:
            awaiting += 1
            continue
        total_value += total
        received += rec
        if out > 0:
            outstanding += out
            clients_with_balance += 1
            aging_rows.append((out, base))
            if is_overdue(True, out, base, today):
                overdue_amount += out
                overdue_clients += 1
                overdue_rows.append((days_since(base, today), ledger_id, name, out))
    overdue_rows.sort(key=lambda r: (-r[0], r[1]))
    return {
        "total_value": money_str(total_value),
        "received": money_str(received),
        "outstanding": money_str(outstanding),
        "overdue_amount": money_str(overdue_amount),
        "clients_with_balance": clients_with_balance,
        "overdue_clients": overdue_clients,
        "collection_rate_pct": collection_rate(total_value, received),
        "awaiting_finalization": awaiting,
        "counts": counts,
        "aging": aging_buckets(aging_rows),
        "top_overdue": [
            {"ledger": lid, "client": name, "outstanding": money_str(out), "days_since": days}
            for days, lid, name, out in overdue_rows[:3]
        ],
    }
