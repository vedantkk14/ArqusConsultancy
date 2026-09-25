"""Sales Exec dashboard: GET /dashboard/sales-exec?period=month|quarter|year|all (Dev A).

The Exec's own leads only. Shared aggregates and queue-building come from `dashboard_common` (the
same functions the Sales Manager dashboard uses, just scoped to this one Exec's `leads_qs` instead
of the whole team). Exec sees `proposed_amount` only, never a ledger, payment, project or
total/final amount, not even as null (see docs/API_CONTRACT.md privacy shield).
"""

from collections import defaultdict
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsSalesExec
from apps.reports.services import DEFAULT_PERIOD, PERIODS, money

from . import selectors
from .dashboard_common import (
    base_kpis,
    period_payload,
    pipeline_counts,
    queue,
    with_last_interaction_at,
    with_last_note,
)
from .models import Interaction
from .serializers import days_overdue

MAX_RECENT_ACTIVITY = 8
UPCOMING_DAYS = 7
UPCOMING_ITEMS_PER_DAY = 5
LAST_NOTE_MAX = 80

#: Undecided (docs/OPEN_DECISIONS.md) - default off. Reads `user.commission_rate` when on, which
#: exists on `users.User` (Dev C); `getattr` with a fallback so this never crashes if that field
#: isn't there in some environment.
SHOW_COMMISSION_TO_EXEC = False


def _leads_qs(user):
    """This Exec's own leads. `selectors.leads_for` already scopes SALES_EXEC to `assigned_to=user`
    and the default manager already excludes soft-deleted rows.
    """
    return selectors.leads_for(user)


def _truncated_note(lead) -> str:
    note = getattr(lead, "last_note", "") or ""
    return note[:LAST_NOTE_MAX]


def _lead_item(lead) -> dict:
    return {
        "id": lead.id,
        "name": lead.name,
        "phone": lead.phone,
        "source": lead.source,
        "status": lead.status,
        "created_at": lead.created_at,
        "next_followup_at": lead.next_followup_at,
        "days_overdue": days_overdue(lead),
        "last_note": _truncated_note(lead),
        "last_interaction_at": getattr(lead, "last_interaction_at", None),
        "proposed_amount": None if lead.proposed_amount is None else money(lead.proposed_amount),
    }


def _exec_queue(qs, ordering: str, total: int) -> dict:
    qs = with_last_interaction_at(with_last_note(qs))
    return queue(qs, ordering, total, _lead_item)


def _upcoming(leads_qs, now) -> list[dict]:
    """Next UPCOMING_DAYS business days after today, grouped by local (business-tz) date.

    One query for the whole window (never one query per day): leads due strictly after the end of
    today's business day and before the end of day `UPCOMING_DAYS`, ordered by follow-up time, then
    grouped in Python. A follow-up that is technically "tomorrow" in UTC but "today" (or the day
    after) in the business timezone groups by the business-tz date, not the UTC one.
    """
    tz = selectors.business_tz()
    _, today_end = selectors.business_day_bounds(now)
    window_end = today_end + timedelta(days=UPCOMING_DAYS)

    rows = with_last_interaction_at(with_last_note(leads_qs)).filter(
        selectors.upcoming_q(now), next_followup_at__lt=window_end
    ).order_by("next_followup_at")

    by_date = defaultdict(list)
    for lead in rows:
        by_date[lead.next_followup_at.astimezone(tz).date()].append(lead)

    days = []
    for offset in range(UPCOMING_DAYS):
        day = (today_end + timedelta(days=offset)).astimezone(tz).date()
        leads = by_date.get(day, [])
        if not leads:
            continue
        days.append(
            {
                "date": day.isoformat(),
                "count": len(leads),
                "items": [_lead_item(lead) for lead in leads[:UPCOMING_ITEMS_PER_DAY]],
            }
        )
    return days


def _estimated_commission(won_value: str, user) -> str:
    rate = Decimal(str(getattr(user, "commission_rate", 0) or 0))
    amount = (Decimal(won_value) * rate / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return money(amount)


def build_sales_exec_dashboard(user, period: str = DEFAULT_PERIOD, today=None) -> dict:
    leads_qs = _leads_qs(user)
    kpis, rng, now = base_kpis(leads_qs, period, today)

    extra = leads_qs.aggregate(no_followup=Count("id", filter=selectors.no_followup_q()))

    overdue_qs = leads_qs.filter(selectors.overdue_q(now))
    today_qs = leads_qs.filter(selectors.due_today_q(now))
    new_leads_qs = leads_qs.filter(selectors.untouched_q())
    no_followup_qs = leads_qs.filter(selectors.no_followup_q())

    queues = {
        "overdue": _exec_queue(overdue_qs, "next_followup_at", kpis["overdue"]),
        "today": _exec_queue(today_qs, "next_followup_at", kpis["followups_today"]),
        "new_leads": _exec_queue(new_leads_qs, "created_at", kpis["new_untouched"]),
        "no_followup": _exec_queue(no_followup_qs, "created_at", extra["no_followup"]),
    }

    if SHOW_COMMISSION_TO_EXEC:
        kpis = {**kpis, "estimated_commission": _estimated_commission(kpis["won_value"], user)}

    recent_rows = (
        Interaction.objects.filter(created_by=user)
        .select_related("lead")
        .order_by("-created_at")[:MAX_RECENT_ACTIVITY]
    )
    recent_activity = [
        {
            "at": row.created_at,
            "lead_id": row.lead_id,
            "lead_name": row.lead.name,
            "type": row.type,
            "text": row.notes,
        }
        for row in recent_rows
    ]

    return {
        "as_of": now,
        "business_date": now.astimezone(selectors.business_tz()).date().isoformat(),
        "period": period_payload(period, rng),
        "kpis": kpis,
        "queues": queues,
        "pipeline": pipeline_counts(leads_qs),
        "upcoming": _upcoming(leads_qs, now),
        "recent_activity": recent_activity,
    }


class SalesExecDashboardView(APIView):
    """KPIs, queues, pipeline, upcoming follow-ups and recent activity for the Sales Exec home.

    ?period=month|quarter|year|all (default month). SALES_EXEC only - ADMIN, SALES_MANAGER and
    PROJECT_MANAGER all get 403.
    """

    permission_classes = [IsSalesExec]

    def get(self, request):
        period = request.query_params.get("period", DEFAULT_PERIOD)
        if period not in PERIODS:
            raise ValidationError({"period": [f"Must be one of {', '.join(PERIODS)}."]})
        return Response(build_sales_exec_dashboard(request.user, period))
