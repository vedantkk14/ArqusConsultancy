"""List filters. Query names are a contract with the dashboard "View all" links."""

import re
from datetime import datetime, time, timedelta

from django.db.models import F, Q, QuerySet
from django.utils import timezone
from django.utils.dateparse import parse_date

from .models import LeadStatus
from .selectors import (
    business_tz,
    due_today_q,
    no_followup_q,
    open_q,
    overdue_q,
    untouched_q,
    upcoming_q,
    won_awaiting_q,
)

FOLLOWUP_FILTERS = {
    "overdue": overdue_q,
    "today": due_today_q,
    "upcoming": upcoming_q,
    "none": lambda now=None: no_followup_q(),
}

ORDERINGS = {
    "created_at": [F("created_at").asc()],
    "-created_at": [F("created_at").desc()],
    "name": [F("name").asc()],
    "next_followup_at": [F("next_followup_at").asc(nulls_last=True)],
    "-days_overdue": [F("next_followup_at").asc(nulls_last=True)],  # most overdue first
    "-proposed_amount": [F("proposed_amount").desc(nulls_last=True)],
    "-last_activity_at": [F("last_activity_at").desc(nulls_last=True)],
    "won_at": [F("won_at").asc(nulls_last=True)],  # won-awaiting: oldest first
}
DEFAULT_ORDERING = "-created_at"
TRUE = {"1", "true", "yes"}


def _day_start(value: str):
    day = parse_date(value or "")
    return datetime.combine(day, time.min, tzinfo=business_tz()) if day else None


def apply_filters(qs: QuerySet, params, *, now=None, skip: tuple[str, ...] = ()) -> QuerySet:
    """Apply the list filters from query params. Unknown or malformed values are ignored."""
    now = now or timezone.now()
    get = params.get

    if "status" not in skip and get("status"):
        wanted = [s for s in get("status").upper().split(",") if s in LeadStatus.values]
        if wanted:
            qs = qs.filter(status__in=wanted)
    if get("assigned_to"):
        if get("assigned_to") == "none":
            qs = qs.filter(assigned_to__isnull=True)
        elif get("assigned_to").isdigit():
            qs = qs.filter(assigned_to_id=int(get("assigned_to")))
    if get("source"):
        qs = qs.filter(source__in=get("source").upper().split(","))
    if q := (get("q") or "").strip():
        cond = Q(name__icontains=q) | Q(email__icontains=q)
        digits = re.sub(r"\D", "", q)
        if len(digits) >= 3:
            cond |= Q(phone__contains=digits)
        qs = qs.filter(cond)
    if "followup" not in skip and get("followup") in FOLLOWUP_FILTERS:
        qs = qs.filter(FOLLOWUP_FILTERS[get("followup")](now))
    if "open" not in skip and (get("open") or "").lower() in TRUE:
        qs = qs.filter(open_q())
    if "untouched" not in skip and (get("untouched") or "").lower() in TRUE:
        qs = qs.filter(untouched_q())
    if "won_awaiting" not in skip and (get("won_awaiting") or "").lower() in TRUE:
        qs = qs.filter(won_awaiting_q())
    if start := _day_start(get("created_from")):
        qs = qs.filter(created_at__gte=start)
    if start := _day_start(get("created_to")):
        qs = qs.filter(created_at__lt=start + timedelta(days=1))
    return qs


def apply_ordering(qs: QuerySet, value: str | None) -> QuerySet:
    return qs.order_by(*ORDERINGS.get(value or "", ORDERINGS[DEFAULT_ORDERING]), "-id")


SUMMARY_SKIP = ("status", "followup", "open", "untouched", "won_awaiting")
