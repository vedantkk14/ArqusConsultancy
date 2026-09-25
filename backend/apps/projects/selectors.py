"""Read side of projects: budget definitions, role scoping and aggregates.

Dev C's dashboard should import `budget_state` and `budget_usage_qs` from here so every screen
agrees on what "near limit" and "over budget" mean.
"""

from datetime import date, datetime, timedelta
from decimal import ROUND_DOWN, Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import (
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.core.permissions import ADMIN, PROJECT_MANAGER

from . import rules
from .models import AlertState, Expense, Project, ProjectStatus

MONEY = DecimalField(max_digits=14, decimal_places=2)
_WARN = Decimal(rules.WARN_PCT) / 100


def business_tz() -> ZoneInfo:
    return ZoneInfo(getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata"))


def business_today(now: datetime | None = None) -> date:
    return (now or timezone.now()).astimezone(business_tz()).date()


def money_str(value) -> str:
    return f"{Decimal(value or 0):.2f}"


# ---- Budget definitions ----------


def budget_state(spent, sanctioned) -> str:
    """'ok' below WARN_PCT, 'warn' from WARN_PCT to OVER_PCT inclusive, 'over' above OVER_PCT."""
    spent, sanctioned = Decimal(spent or 0), Decimal(sanctioned or 0)
    if sanctioned <= 0:
        return "over" if spent > 0 else "ok"
    if spent * 100 > rules.OVER_PCT * sanctioned:
        return "over"
    if spent * 100 >= rules.WARN_PCT * sanctioned:
        return "warn"
    return "ok"


def usage_pct(spent, sanctioned) -> str:
    spent, sanctioned = Decimal(spent or 0), Decimal(sanctioned or 0)
    if sanctioned <= 0:
        return "0.00"
    return f"{(spent * 100 / sanctioned).quantize(Decimal('0.01'), rounding=ROUND_DOWN):.2f}"


def remaining(spent, sanctioned) -> Decimal:
    return Decimal(sanctioned or 0) - Decimal(spent or 0)


def suggested_budget(total) -> str | None:
    if total is None:
        return None
    return f"{(Decimal(total) * rules.SUGGESTED_BUDGET_PCT / 100).quantize(Decimal('0.01')):.2f}"


def project_margins(finance: dict | None, spent, sanctioned) -> dict:
    """Admin only. live = received - expenses; planned = deal total - sanctioned budget."""
    if not finance or finance.get("total_amount") is None:
        return {"planned_margin": None, "live_margin": None}
    received = finance.get("received")
    return {
        "planned_margin": money_str(Decimal(finance["total_amount"]) - Decimal(sanctioned)),
        "live_margin": None if received is None else money_str(Decimal(received) - Decimal(spent)),
    }


def state_q(state: str) -> Q:
    """Q for querysets annotated with `spent`; `state` is ok, warn or over."""
    sanctioned = F("sanctioned_budget")
    if state == "over":
        return Q(spent__gt=sanctioned)
    if state == "warn":
        return Q(spent__gte=sanctioned * _WARN, spent__lte=sanctioned)
    return Q(spent__lt=sanctioned * _WARN)


# ---- Querysets ----------


def active_expenses() -> QuerySet:
    return Expense.objects.filter(is_void=False)


def budget_usage_qs(qs: QuerySet | None = None) -> QuerySet:
    """Annotate projects with `spent` (non-void expenses) and `usage` (spent / sanctioned x 100)."""
    total = (
        active_expenses()
        .filter(project=OuterRef("pk"))
        .order_by()
        .values("project")
        .annotate(total=Sum("amount"))
        .values("total")
    )
    qs = Project.objects.all() if qs is None else qs
    return qs.annotate(
        spent=Coalesce(
            Subquery(total, output_field=MONEY), Value(Decimal("0.00")), output_field=MONEY
        )
    ).annotate(
        usage=ExpressionWrapper(
            F("spent") * 100 / F("sanctioned_budget"),
            output_field=DecimalField(max_digits=18, decimal_places=4),
        )
    )


def projects_for(user) -> QuerySet:
    """Every project query starts here. A PM only ever sees projects assigned to them."""
    qs = Project.objects.select_related("pm")
    if user.role == ADMIN:
        return qs
    if user.role == PROJECT_MANAGER:
        return qs.filter(pm=user)
    return qs.none()


def expenses_for(user) -> QuerySet:
    qs = Expense.objects.select_related("project", "logged_by")
    if user.role == ADMIN:
        return qs
    if user.role == PROJECT_MANAGER:
        return qs.filter(project__pm=user)
    return qs.none()


def spent_for(project) -> Decimal:
    return (
        active_expenses()
        .filter(project=project)
        .aggregate(t=Coalesce(Sum("amount"), Value(Decimal("0.00")), output_field=MONEY))["t"]
    )


def edit_window_open(expense, now: datetime | None = None) -> bool:
    return (now or timezone.now()) - expense.created_at <= timedelta(
        minutes=rules.PM_EDIT_WINDOW_MINUTES
    )


def can_change_expense(user, expense, now: datetime | None = None) -> bool:
    """Edit or void: ADMIN always; the logging PM within the window. Never on completed projects."""
    if expense.project.status != ProjectStatus.RUNNING or expense.is_void:
        return False
    if user.role == ADMIN:
        return True
    return (
        user.role == PROJECT_MANAGER
        and expense.project.pm_id == user.pk
        and expense.logged_by_id == user.pk
        and edit_window_open(expense, now)
    )


def allowed_actions(user, project) -> list[str]:
    running = project.status == ProjectStatus.RUNNING
    is_admin = user.role == ADMIN
    is_pm = user.role == PROJECT_MANAGER and project.pm_id == user.pk
    actions = []
    if running and (is_admin or is_pm):
        actions += ["add_expense", "complete"]
    if running and is_admin:
        actions += ["adjust_budget", "reassign", "edit"]
    if not running and is_admin:
        actions.append("reopen")
        if Decimal(getattr(project, "spent", 0) or 0) < project.sanctioned_budget:
            actions.append("release_budget")
    pending = getattr(project, "pending_requests", None)
    has_pending = (
        bool(pending)
        if pending is not None
        else project.budget_requests.filter(status="PENDING").exists()
    )
    if running and is_pm and not has_pending:
        actions.append("request_budget")
    if running and is_admin and has_pending:
        actions.append("decide_budget_request")
    return actions


# ---- Summaries ----------


def project_summary(qs: QuerySet, status: str) -> dict:
    """`qs` is role-scoped, filtered (except status and state) and annotated by budget_usage_qs."""
    counts = qs.order_by().aggregate(
        running=Count("id", filter=Q(status=ProjectStatus.RUNNING)),
        completed=Count("id", filter=Q(status=ProjectStatus.COMPLETED)),
    )
    states = {"ok": 0, "warn": 0, "over": 0}
    no_pm = 0
    sanctioned_total = spent_total = Decimal("0")
    for spent, sanctioned, pm_id in qs.filter(status=status).values_list(
        "spent", "sanctioned_budget", "pm_id"
    ):
        states[budget_state(spent, sanctioned)] += 1
        no_pm += pm_id is None
        sanctioned_total += sanctioned
        spent_total += spent
    return {
        **counts,
        **states,
        "no_pm": no_pm,
        "sanctioned_total": money_str(sanctioned_total),
        "spent_total": money_str(spent_total),
    }


def alert_state_rank(state: str) -> int:
    return [AlertState.OK, AlertState.WARN, AlertState.OVER].index(state)
