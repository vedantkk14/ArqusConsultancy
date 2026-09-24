"""Shared building blocks for the leads-owned dashboards (Sales Exec's own, Sales Manager's team).

Both dashboards scope everything through a `leads_qs`; only the queryset differs (one Exec's own
leads vs. the whole team's). Business-day/open/overdue/due-today/untouched definitions live in
`selectors`; period math and money formatting come from `apps.reports.services` (read-only import).
This is the one place their shared aggregates and queue-building live, so neither dashboard
restates the other's logic - each layers its own role-specific pieces (by-executive, unassigned,
upcoming, ...) on top of what's here.
"""

from datetime import datetime

from django.db.models import Count, DecimalField, OuterRef, Q, QuerySet, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.reports.services import PeriodRange, money, period_range, win_rate_pct

from . import selectors
from .models import Interaction, LeadStatus

MAX_QUEUE_ITEMS = 10
MONEY_FIELD = DecimalField(max_digits=14, decimal_places=2)


def with_last_note(qs: QuerySet) -> QuerySet:
    latest_notes = (
        Interaction.objects.filter(lead=OuterRef("pk")).order_by("-created_at").values("notes")[:1]
    )
    return qs.annotate(last_note=Subquery(latest_notes))


def with_last_interaction_at(qs: QuerySet) -> QuerySet:
    latest = (
        Interaction.objects.filter(lead=OuterRef("pk"))
        .order_by("-created_at")
        .values("created_at")[:1]
    )
    return qs.annotate(last_interaction_at=Subquery(latest))


def base_kpis(leads_qs: QuerySet, period: str, today=None) -> tuple[dict, PeriodRange, datetime]:
    """open/overdue/due-today/untouched counts, and won/lost/won_value/conversion_pct for `period`.

    One aggregate query. Returns (kpis, period_range, now) so a caller can reuse the range and the
    "now" instant for its own period-scoped queries (e.g. a per-executive breakdown) without a
    second `timezone.now()` call landing a moment later than this one.
    """
    today = today or timezone.localdate()
    now = timezone.now()
    rng = period_range(period, today)

    won_q = Q(status=LeadStatus.WON)
    # Lead has no `lost_at`; `updated_at` is the closest proxy for "decided within the period"
    # (set exactly when change_status() saves the LOST transition). See docs/OPEN_DECISIONS.md.
    lost_q = Q(status=LeadStatus.LOST)
    if rng.start:
        won_q &= Q(won_at__date__gte=rng.start)
        lost_q &= Q(updated_at__date__gte=rng.start)

    counts = leads_qs.aggregate(
        open_leads=Count("id", filter=selectors.open_q()),
        overdue=Count("id", filter=selectors.overdue_q(now)),
        today=Count("id", filter=selectors.due_today_q(now)),
        untouched=Count("id", filter=selectors.untouched_q()),
        won=Count("id", filter=won_q),
        lost=Count("id", filter=lost_q),
        won_value=Coalesce(
            Sum("proposed_amount", filter=won_q), Value(0), output_field=MONEY_FIELD
        ),
    )
    kpis = {
        "open_leads": counts["open_leads"],
        "new_untouched": counts["untouched"],
        "followups_today": counts["today"],
        "overdue": counts["overdue"],
        "won_count": counts["won"],
        "lost_count": counts["lost"],
        "conversion_pct": win_rate_pct(counts["won"], counts["lost"]),
        "won_value": money(counts["won_value"]),
    }
    return kpis, rng, now


def pipeline_counts(leads_qs: QuerySet) -> list[dict]:
    """Every status in workflow order, zeros included - never omit a status with no leads."""
    counts = dict(leads_qs.order_by().values_list("status").annotate(count=Count("id")))
    return [{"status": s.value, "count": counts.get(s.value, 0)} for s in LeadStatus]


def queue(qs: QuerySet, ordering: str, total: int, item_fn) -> dict:
    """`total` is passed in (usually already known from an earlier aggregate) so this never issues
    a second COUNT query. `item_fn(lead)` builds one item dict; annotate `qs` before calling this.
    """
    rows = list(qs.order_by(ordering)[:MAX_QUEUE_ITEMS])
    return {"total": total, "items": [item_fn(lead) for lead in rows]}


def period_payload(period_key: str, rng: PeriodRange) -> dict:
    return {
        "key": period_key,
        "from": rng.start.isoformat() if rng.start else None,
        "to": rng.end.isoformat(),
    }
