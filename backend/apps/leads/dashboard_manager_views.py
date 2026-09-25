"""Sales Manager dashboard: GET /dashboard/sales-manager?period=month|quarter|year|all (Dev A).

Team-scoped view of the same leads every Sales Exec's own dashboard shows. Shared aggregates and
queue-building come from `dashboard_common`; only the manager-only pieces (unassigned queue,
by-executive breakdown, team recent activity) live here.

Manager sees `proposed_amount` only, exactly like the rest of the Leads API - never a ledger,
payment, project or total/final amount, not even as null (see docs/API_CONTRACT.md privacy shield).
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import SALES_EXEC, IsSalesManager
from apps.reports.services import DEFAULT_PERIOD, PERIODS, money, win_rate_pct

from . import selectors
from .dashboard_common import (
    MAX_QUEUE_ITEMS,
    MONEY_FIELD,
    base_kpis,
    period_payload,
    pipeline_counts,
    queue,
    with_last_note,
)
from .models import Interaction, Lead, LeadStatus
from .serializers import days_overdue

#: Highlight (not judge) an exec whose overdue count passes this on the by-executive list.
OVERDUE_HIGHLIGHT_THRESHOLD = 3


def _team_qs():
    """Leads owned by an active Sales Exec - the manager's team, never anyone else's."""
    return Lead.objects.filter(assigned_to__role=SALES_EXEC, assigned_to__is_active=True)


def _unassigned_qs():
    return Lead.objects.filter(assigned_to__isnull=True)


def _lead_item(lead, *, with_assignee: bool) -> dict:
    item = {
        "id": lead.id,
        "name": lead.name,
        "phone": lead.phone,
        "status": lead.status,
        "source_label": lead.source_other or lead.get_source_display(),
        "next_followup_at": lead.next_followup_at,
        "days_overdue": days_overdue(lead),
        "proposed_amount": money(lead.proposed_amount),
        "last_note": getattr(lead, "last_note", "") or "",
    }
    if with_assignee:
        item["assigned_to"] = (
            {"id": lead.assigned_to_id, "name": lead.assigned_to.display_name}
            if lead.assigned_to_id
            else None
        )
    return item


def _manager_queue(qs, ordering: str, total: int, *, with_assignee: bool) -> dict:
    qs = with_last_note(qs.select_related("assigned_to"))
    return queue(qs, ordering, total, lambda lead: _lead_item(lead, with_assignee=with_assignee))


def build_sales_manager_dashboard(period: str = DEFAULT_PERIOD, today=None) -> dict:
    team_qs = _team_qs()
    kpis, rng, now = base_kpis(team_qs, period, today)

    # ---- Manager-only additions to the team aggregate: won-awaiting + unassigned -------------
    extra = team_qs.aggregate(won_awaiting=Count("id", filter=selectors.won_awaiting_q()))
    unassigned_qs = _unassigned_qs()
    unassigned_total = unassigned_qs.count()

    overdue_qs = team_qs.filter(selectors.overdue_q(now))
    today_qs = team_qs.filter(selectors.due_today_q(now))
    won_awaiting_qs = team_qs.filter(selectors.won_awaiting_q())
    queues = {
        "overdue": _manager_queue(
            overdue_qs, "next_followup_at", kpis["overdue"], with_assignee=True
        ),
        "today": _manager_queue(
            today_qs, "next_followup_at", kpis["followups_today"], with_assignee=True
        ),
        "unassigned": _manager_queue(
            unassigned_qs, "created_at", unassigned_total, with_assignee=False
        ),
        "won_awaiting": _manager_queue(
            won_awaiting_qs, "won_at", extra["won_awaiting"], with_assignee=True
        ),
    }

    # ---- By executive: one annotated query over active Sales Execs (zero-lead execs included) --
    User = get_user_model()
    exec_won_q = Q(assigned_leads__status=LeadStatus.WON)
    exec_lost_q = Q(assigned_leads__status=LeadStatus.LOST)
    if rng.start:
        exec_won_q &= Q(assigned_leads__won_at__date__gte=rng.start)
        exec_lost_q &= Q(assigned_leads__updated_at__date__gte=rng.start)
    by_exec_rows = (
        User.objects.filter(role=SALES_EXEC, is_active=True)
        .annotate(
            open_leads=Count("assigned_leads", filter=selectors.open_q("assigned_leads__")),
            overdue=Count("assigned_leads", filter=selectors.overdue_q(now, "assigned_leads__")),
            won_count=Count("assigned_leads", filter=exec_won_q),
            lost_count=Count("assigned_leads", filter=exec_lost_q),
            won_value=Coalesce(
                Sum("assigned_leads__proposed_amount", filter=exec_won_q),
                Value(0),
                output_field=MONEY_FIELD,
            ),
        )
        .order_by("-open_leads", "first_name", "username")
    )
    by_executive = [
        {
            "id": u.id,
            "name": u.display_name,
            "open_leads": u.open_leads,
            "overdue": u.overdue,
            "won_count": u.won_count,
            "won_value": money(u.won_value),
            "conversion_pct": win_rate_pct(u.won_count, u.lost_count),
            "load_score": u.open_leads + u.overdue * 2,
        }
        for u in by_exec_rows
    ]

    # ---- Recent team activity: last interactions logged by any active Sales Exec --------------
    recent_rows = (
        Interaction.objects.filter(created_by__role=SALES_EXEC, created_by__is_active=True)
        .select_related("created_by", "lead")
        .order_by("-created_at")[:MAX_QUEUE_ITEMS]
    )
    recent_activity = [
        {
            "at": row.created_at,
            "exec_name": row.created_by.display_name if row.created_by else "",
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
        "kpis": {
            "team_open_leads": kpis["open_leads"],
            "team_new_untouched": kpis["new_untouched"],
            "team_followups_today": kpis["followups_today"],
            "team_overdue": kpis["overdue"],
            "team_won_count": kpis["won_count"],
            "team_lost_count": kpis["lost_count"],
            "team_conversion_pct": kpis["conversion_pct"],
            "team_won_value": kpis["won_value"],
            "unassigned_leads": unassigned_total,
        },
        "queues": queues,
        "by_executive": by_executive,
        "pipeline": pipeline_counts(team_qs),
        "recent_activity": recent_activity,
    }


class SalesManagerDashboardView(APIView):
    """KPIs, queues and the by-executive breakdown for the Sales Manager home.

    ?period=month|quarter|year|all (default month). SALES_MANAGER only - ADMIN, SALES_EXEC and
    PROJECT_MANAGER all get 403 (this is not the admin dashboard: no ledger/payment/project data).
    """

    permission_classes = [IsSalesManager]

    def get(self, request):
        period = request.query_params.get("period", DEFAULT_PERIOD)
        if period not in PERIODS:
            raise ValidationError({"period": [f"Must be one of {', '.join(PERIODS)}."]})
        return Response(build_sales_manager_dashboard(period))
