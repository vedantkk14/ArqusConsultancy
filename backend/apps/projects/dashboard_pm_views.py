"""GET /api/v1/dashboard/pm: the PROJECT_MANAGER home. PM-scoped, no finance, no lead data.

Budget figures come from the same selectors as the project detail page, so they always agree.
"""

from datetime import UTC
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import PROJECT_MANAGER, HasRole
from apps.reports.services import DEFAULT_PERIOD, PERIODS, period_range

from . import selectors
from .models import EventType, ProjectEvent, ProjectStatus

RECENT_EXPENSE_COUNT = 8
RECENT_ACTIVITY_COUNT = 8
_ACTIVITY_TYPES = {
    EventType.PM_ASSIGNED: ("project_assigned", "Project assigned to you"),
    EventType.BUDGET_CHANGED: ("budget_changed", "Sanctioned budget changed"),
    EventType.EXPENSE_ADDED: ("expense_added", "Expense added"),
    EventType.COMPLETED: ("project_completed", "Project marked Completed"),
    EventType.REOPENED: ("project_reopened", "Project reopened"),
}
_STATE_RANK = {"over": 0, "warn": 1}


class _Query(serializers.Serializer):
    period = serializers.ChoiceField(choices=PERIODS, default=DEFAULT_PERIOD, required=False)


def _iso(moment) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _activity_text(event) -> tuple[str, str]:
    kind, text = _ACTIVITY_TYPES[event.type]
    if event.type == EventType.EXPENSE_ADDED and event.data.get("category"):
        text = f"Expense added: {str(event.data['category']).title()}"
    return kind, text


def build_pm_dashboard(user, period: str) -> dict:
    now = timezone.now()
    today = selectors.business_today(now)
    rng = period_range(period, today)

    rows = list(
        selectors.budget_usage_qs(selectors.projects_for(user)).order_by("status", "-created_at")
    )
    rows.sort(key=lambda p: p.status != ProjectStatus.RUNNING)  # running first, stable otherwise
    projects, alerts = [], []
    sanctioned_total = spent_total = Decimal("0")
    for p in rows:
        state = selectors.budget_state(p.spent, p.sanctioned_budget)
        item = {
            "id": p.pk,
            "name": p.name,
            "client_name": p.client_name,
            "status": p.status,
            "sanctioned_budget": selectors.money_str(p.sanctioned_budget),
            "spent": selectors.money_str(p.spent),
            "remaining": selectors.money_str(selectors.remaining(p.spent, p.sanctioned_budget)),
            "usage_pct": selectors.usage_pct(p.spent, p.sanctioned_budget),
            "state": state,
            "expected_end_date": p.expected_end_date,
        }
        projects.append(item)
        sanctioned_total += p.sanctioned_budget
        spent_total += p.spent
        if state != "ok" and p.status == ProjectStatus.RUNNING:
            alerts.append(
                {
                    "project_id": p.pk,
                    "project_name": p.name,
                    "state": state,
                    "usage_pct": item["usage_pct"],
                    "remaining": item["remaining"],
                }
            )
    alerts.sort(key=lambda a: (_STATE_RANK[a["state"]], -Decimal(a["usage_pct"])))

    mine = selectors.expenses_for(user)
    in_period = selectors.active_expenses().filter(project__pm=user, spent_on__lte=rng.end)
    if rng.start:
        in_period = in_period.filter(spent_on__gte=rng.start)
    logged = in_period.aggregate(n=Count("id"), total=Sum("amount"))

    recent = [
        {
            "id": e.pk,
            "project_id": e.project_id,
            "project_name": e.project.name,
            "category": e.category,
            "amount": selectors.money_str(e.amount),
            "spent_on": e.spent_on,
            "has_receipt": bool(e.receipt),
            "is_void": e.is_void,
        }
        for e in mine.order_by("-spent_on", "-id")[:RECENT_EXPENSE_COUNT]
    ]

    events = (
        ProjectEvent.objects.filter(project__pm=user, type__in=list(_ACTIVITY_TYPES))
        .select_related("project")
        .order_by("-created_at", "-id")[:RECENT_ACTIVITY_COUNT]
    )
    activity = []
    for event in events:
        kind, text = _activity_text(event)
        activity.append(
            {
                "at": _iso(event.created_at),
                "type": kind,
                "project_id": event.project_id,
                "project_name": event.project.name,
                "text": text,
            }
        )

    running = sum(p["status"] == ProjectStatus.RUNNING for p in projects)
    return {
        "as_of": _iso(now),
        "business_date": today,
        "period": {"key": period, "from": rng.start, "to": rng.end},
        "kpis": {
            "projects_running": running,
            "projects_completed": len(projects) - running,
            "total_sanctioned": selectors.money_str(sanctioned_total),
            "total_spent": selectors.money_str(spent_total),
            "total_remaining": selectors.money_str(sanctioned_total - spent_total),
            "expenses_logged_period": logged["n"],
            "expenses_amount_period": selectors.money_str(logged["total"]),
        },
        "projects": projects,
        "alerts": alerts,
        "recent_expenses": recent,
        "recent_activity": activity,
    }


class PMDashboardView(APIView):
    """?period=month|quarter|year|all (default month). PROJECT_MANAGER only."""

    permission_classes = [HasRole(PROJECT_MANAGER)]

    @extend_schema(parameters=[_Query], responses=dict)
    def get(self, request):
        query = _Query(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response(build_pm_dashboard(request.user, query.validated_data["period"]))
