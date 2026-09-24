"""Sales Manager dashboard: GET /dashboard/sales-manager?period=month|quarter|year|all (Dev A).

Team-scoped view of the same leads every Sales Exec's own dashboard would show. Business-day,
overdue/due-today/won-awaiting definitions all come from `selectors`; period math and money
formatting come from `apps.reports.services` (read-only import; nothing here restates them).

Manager sees `proposed_amount` only, exactly like the rest of the Leads API - never a ledger,
payment, project or total/final amount, not even as null (see docs/API_CONTRACT.md privacy shield).
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, DecimalField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import SALES_EXEC, IsSalesManager
from apps.reports.services import DEFAULT_PERIOD, PERIODS, money, period_range, win_rate_pct

from . import selectors
from .models import Interaction, Lead, LeadStatus
from .serializers import days_overdue

MAX_QUEUE_ITEMS = 10
#: Highlight (not judge) an exec whose overdue count passes this on the by-executive list.
OVERDUE_HIGHLIGHT_THRESHOLD = 3
MONEY_FIELD = DecimalField(max_digits=14, decimal_places=2)


def _team_qs():
    """Leads owned by an active Sales Exec - the manager's team, never anyone else's."""
    return Lead.objects.filter(assigned_to__role=SALES_EXEC, assigned_to__is_active=True)


def _unassigned_qs():
    return Lead.objects.filter(assigned_to__isnull=True)


def _with_last_note(qs):
    latest_notes = (
        Interaction.objects.filter(lead=OuterRef("pk")).order_by("-created_at").values("notes")[:1]
    )
    return qs.annotate(last_note=Subquery(latest_notes))


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


def _queue(qs, ordering: str, total: int, *, with_assignee: bool) -> dict:
    qs = _with_last_note(qs.select_related("assigned_to")).order_by(ordering)
    items = list(qs[:MAX_QUEUE_ITEMS])
    rows = [_lead_item(lead, with_assignee=with_assignee) for lead in items]
    return {"total": total, "items": rows}


def build_sales_manager_dashboard(period: str = DEFAULT_PERIOD, today=None) -> dict:
    today = today or timezone.localdate()
    now = timezone.now()
    rng = period_range(period, today)
    team_qs = _team_qs()

    won_period_q = Q(status=LeadStatus.WON)
    # Lead has no `lost_at`; `updated_at` is the closest proxy for "decided within the period"
    # (set exactly when change_status() saves the LOST transition). See docs/OPEN_DECISIONS.md.
    lost_period_q = Q(status=LeadStatus.LOST)
    if rng.start:
        won_period_q &= Q(won_at__date__gte=rng.start)
        lost_period_q &= Q(updated_at__date__gte=rng.start)

    # ---- Team KPIs: one aggregate query over the whole team ----------------------------------
    counts = team_qs.aggregate(
        open_leads=Count("id", filter=selectors.open_q()),
        overdue=Count("id", filter=selectors.overdue_q(now)),
        today=Count("id", filter=selectors.due_today_q(now)),
        untouched=Count("id", filter=selectors.untouched_q()),
        won_awaiting=Count("id", filter=selectors.won_awaiting_q()),
        won=Count("id", filter=won_period_q),
        won_value=Coalesce(
            Sum("proposed_amount", filter=won_period_q), Value(0), output_field=MONEY_FIELD
        ),
        lost=Count("id", filter=lost_period_q),
    )

    unassigned_qs = _unassigned_qs()
    unassigned_total = unassigned_qs.count()

    overdue_qs = team_qs.filter(selectors.overdue_q(now))
    today_qs = team_qs.filter(selectors.due_today_q(now))
    won_awaiting_qs = team_qs.filter(selectors.won_awaiting_q())
    queues = {
        "overdue": _queue(overdue_qs, "next_followup_at", counts["overdue"], with_assignee=True),
        "today": _queue(today_qs, "next_followup_at", counts["today"], with_assignee=True),
        "unassigned": _queue(unassigned_qs, "created_at", unassigned_total, with_assignee=False),
        "won_awaiting": _queue(
            won_awaiting_qs, "won_at", counts["won_awaiting"], with_assignee=True
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

    # ---- Team pipeline: one values().annotate() query -----------------------------------------
    pipeline_counts = dict(team_qs.order_by().values_list("status").annotate(count=Count("id")))
    pipeline = [{"status": s.value, "count": pipeline_counts.get(s.value, 0)} for s in LeadStatus]

    # ---- Recent team activity: last 10 interactions logged by any active Sales Exec -----------
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
        "period": {
            "key": period,
            "from": rng.start.isoformat() if rng.start else None,
            "to": rng.end.isoformat(),
        },
        "kpis": {
            "team_open_leads": counts["open_leads"],
            "team_new_untouched": counts["untouched"],
            "team_followups_today": counts["today"],
            "team_overdue": counts["overdue"],
            "team_won_count": counts["won"],
            "team_lost_count": counts["lost"],
            "team_conversion_pct": win_rate_pct(counts["won"], counts["lost"]),
            "team_won_value": money(counts["won_value"]),
            "unassigned_leads": unassigned_total,
        },
        "queues": queues,
        "by_executive": by_executive,
        "pipeline": pipeline,
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
