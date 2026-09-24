"""Read side of leads: definitions, role scoping and aggregates.

The dashboards (apps/reports) should import OPEN/overdue/due-today definitions from here instead of
re-deriving them, so every screen agrees on what "overdue" means.
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import (
    Count,
    DecimalField,
    Exists,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.core.permissions import ADMIN, SALES_EXEC, SALES_MANAGER

from . import integrations
from .models import Interaction, Lead, LeadStatus

CLOSED_STATUSES = (LeadStatus.WON, LeadStatus.LOST)
OPEN_STATUSES = (LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.INTERESTED)
LIST_ROLES = (ADMIN, SALES_MANAGER, SALES_EXEC)
MANAGER_ROLES = (ADMIN, SALES_MANAGER)


def business_tz() -> ZoneInfo:
    return ZoneInfo(getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata"))


def business_day_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """[start, end) of the current business day, as aware datetimes."""
    local = (now or timezone.now()).astimezone(business_tz())
    start = datetime.combine(local.date(), time.min, tzinfo=business_tz())
    return start, start + timedelta(days=1)


# ---- Definitions (Q objects) ----------


def open_q() -> Q:
    return ~Q(status__in=CLOSED_STATUSES)


def overdue_q(now: datetime | None = None) -> Q:
    """Open and the follow-up time has passed."""
    return open_q() & Q(next_followup_at__lt=now or timezone.now())


def due_today_q(now: datetime | None = None) -> Q:
    """Open and due between now and the end of the business day (never overlaps with overdue)."""
    now = now or timezone.now()
    _, end = business_day_bounds(now)
    return open_q() & Q(next_followup_at__gte=now, next_followup_at__lt=end)


def upcoming_q(now: datetime | None = None) -> Q:
    _, end = business_day_bounds(now)
    return open_q() & Q(next_followup_at__gte=end)


def no_followup_q() -> Q:
    return open_q() & Q(next_followup_at__isnull=True)


def untouched_q() -> Q:
    """NEW with no interactions at all."""
    return Q(status=LeadStatus.NEW) & ~Q(Exists(Interaction.objects.filter(lead=OuterRef("pk"))))


def won_awaiting_q() -> Q:
    """Won and not yet finalized in accounts (all won leads until the Ledger marker exists)."""
    return Q(status=LeadStatus.WON) & ~Q(integrations.finalized_exists())


# ---- Querysets ----------


def leads_for(user) -> QuerySet:
    """Every lead query starts here. A Sales Exec only ever sees their own leads."""
    qs = Lead.objects.select_related("assigned_to")
    if user.role == SALES_EXEC:
        return qs.filter(assigned_to=user)
    if user.role in MANAGER_ROLES:
        return qs
    return qs.none()


def with_list_annotations(qs: QuerySet) -> QuerySet:
    latest = (
        Interaction.objects.filter(lead=OuterRef("pk"))
        .order_by("-created_at")
        .values("created_at")[:1]
    )
    return qs.annotate(last_activity_at=Subquery(latest))


def summary(qs: QuerySet, now: datetime | None = None) -> dict:
    """Counts for the chips and board headers. `qs` is already role-scoped (and filtered)."""
    now = now or timezone.now()
    money = DecimalField(max_digits=14, decimal_places=2)
    rows = {
        r["status"]: r
        for r in qs.order_by()
        .values("status")
        .annotate(
            count=Count("id"), value=Coalesce(Sum("proposed_amount"), Value(0), output_field=money)
        )
    }
    by_status = [
        {
            "status": s.value,
            "count": rows.get(s.value, {}).get("count", 0),
            "value": f"{rows.get(s.value, {}).get('value', 0):.2f}",
        }
        for s in LeadStatus
    ]
    counts = qs.order_by().aggregate(
        overdue=Count("id", filter=overdue_q(now)),
        today=Count("id", filter=due_today_q(now)),
        untouched=Count("id", filter=untouched_q()),
        no_followup=Count("id", filter=no_followup_q()),
        won_awaiting=Count("id", filter=won_awaiting_q()),
    )
    return {"by_status": by_status, **counts}
