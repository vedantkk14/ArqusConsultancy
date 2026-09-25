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
from .models import Interaction, InteractionType, Lead, LeadStatus

CLOSED_STATUSES = (LeadStatus.WON, LeadStatus.LOST)
#: Logged automatically by the system (assign, status change, amount edit), never by a person
#: choosing to act on the lead - so these don't count as "touched" for untouched_q().
SYSTEM_INTERACTION_TYPES = (
    InteractionType.STATUS_CHANGE,
    InteractionType.ASSIGNMENT,
    InteractionType.AMOUNT_CHANGE,
)
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


def open_q(prefix: str = "") -> Q:
    """`prefix` lets a caller reuse this filtering a queryset through a relation, e.g.

    `open_q("assigned_leads__")` inside `Count("assigned_leads", filter=...)` on a User queryset.
    """
    return ~Q(**{f"{prefix}status__in": CLOSED_STATUSES})


def overdue_q(now: datetime | None = None, prefix: str = "") -> Q:
    """Open and the follow-up time has passed."""
    return open_q(prefix) & Q(**{f"{prefix}next_followup_at__lt": now or timezone.now()})


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
    """NEW with no interaction from a person yet.

    A system-logged ASSIGNMENT/STATUS_CHANGE/AMOUNT_CHANGE doesn't count as a touch - a lead a
    manager just assigned, with nothing else done to it, is still untouched from the Exec's side.
    """
    human_touch = Interaction.objects.filter(lead=OuterRef("pk")).exclude(
        type__in=SYSTEM_INTERACTION_TYPES
    )
    return Q(status=LeadStatus.NEW) & ~Q(Exists(human_touch))


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
    return qs.annotate(
        last_activity_at=Subquery(latest), is_finalized=integrations.finalized_exists()
    )


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
