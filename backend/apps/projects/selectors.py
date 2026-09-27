"""Read side of projects: budget definitions, role scoping and aggregates.

A project's budget is its deal total (the finalized accounts ledger total). Only the Admin sees it,
with expenses so far and what remains; a Project Manager only ever sees the expenses themselves.
Dev C's dashboard should import `budget_state` and `budget_usage_qs` from here so every screen
agrees on what "near limit" and "over budget" mean.
"""

from datetime import date, datetime, timedelta
from decimal import ROUND_DOWN, Decimal
from zoneinfo import ZoneInfo

from django.apps import apps
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
from django.db.models.functions import Coalesce, NullIf
from django.utils import timezone

from apps.core.permissions import ADMIN, PROJECT_MANAGER

from . import rules
from .models import Expense, Project, ProjectStatus

MONEY = DecimalField(max_digits=14, decimal_places=2)
_WARN = Decimal(rules.WARN_PCT) / 100


def business_tz() -> ZoneInfo:
    return ZoneInfo(getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata"))


def business_today(now: datetime | None = None) -> date:
    return (now or timezone.now()).astimezone(business_tz()).date()


def money_str(value) -> str:
    return f"{Decimal(value or 0):.2f}"


# ---- Budget definitions ----------


def budget_state(spent, total) -> str:
    """'ok' below WARN_PCT of the deal total, 'warn' up to 100% inclusive, 'over' above it.

    With no deal total yet (not finalized) there is nothing to measure against: always 'ok'.
    """
    spent = Decimal(spent or 0)
    if total is None or Decimal(total) <= 0:
        return "ok"
    total = Decimal(total)
    if spent * 100 > rules.OVER_PCT * total:
        return "over"
    if spent * 100 >= rules.WARN_PCT * total:
        return "warn"
    return "ok"


def usage_pct(spent, total) -> str:
    spent = Decimal(spent or 0)
    if total is None or Decimal(total) <= 0:
        return "0.00"
    return f"{(spent * 100 / Decimal(total)).quantize(Decimal('0.01'), rounding=ROUND_DOWN):.2f}"


def remaining(spent, total) -> Decimal | None:
    """Deal total minus expenses so far (negative when overspent); None without a deal total."""
    if total is None:
        return None
    return Decimal(total) - Decimal(spent or 0)


def project_margins(finance: dict | None, spent) -> dict:
    """Admin only. live margin = money received - expenses so far."""
    received = (finance or {}).get("received")
    return {
        "live_margin": None if received is None else money_str(Decimal(received) - Decimal(spent)),
    }


def state_q(state: str) -> Q:
    """Q for querysets from budget_usage_qs (annotated `spent`, `total_budget`): ok, warn or over.

    A project without a deal total is always "ok".
    """
    total = F("total_budget")
    if state == "over":
        return Q(total_budget__gt=0, spent__gt=total)
    if state == "warn":
        return Q(total_budget__gt=0, spent__gte=total * _WARN, spent__lte=total)
    return Q(total_budget__isnull=True) | Q(total_budget__lte=0) | Q(spent__lt=total * _WARN)


# ---- Querysets ----------


def active_expenses() -> QuerySet:
    return Expense.objects.filter(is_void=False)


def _ledger_model():
    """accounts.Ledger if the accounts app defines it (read via the registry, never imported)."""
    try:
        return apps.get_model("accounts", "Ledger")
    except LookupError:
        return None


def budget_usage_qs(qs: QuerySet | None = None) -> QuerySet:
    """Annotate projects with `spent` (non-void expenses), `total_budget` (the finalized deal total,
    or NULL) and `usage` (spent / total x 100, NULL without a total).
    """
    total = (
        active_expenses()
        .filter(project=OuterRef("pk"))
        .order_by()
        .values("project")
        .annotate(total=Sum("amount"))
        .values("total")
    )
    qs = Project.objects.all() if qs is None else qs
    ledger = _ledger_model()
    if ledger is not None:
        deal_total = Subquery(
            ledger.objects.filter(lead=OuterRef("lead"), finalized_at__isnull=False).values(
                "total_amount"
            )[:1],
            output_field=MONEY,
        )
    else:
        deal_total = Value(None, output_field=MONEY)
    return qs.annotate(
        spent=Coalesce(
            Subquery(total, output_field=MONEY), Value(Decimal("0.00")), output_field=MONEY
        ),
        total_budget=deal_total,
    ).annotate(
        usage=ExpressionWrapper(
            F("spent") * 100 / NullIf(F("total_budget"), Value(Decimal("0"))),
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
        actions += ["reassign", "edit"]
    if not running and is_admin:
        actions.append("reopen")
    return actions


# ---- Summaries ----------


def project_summary(qs: QuerySet, status: str) -> dict:
    """`qs` is role-scoped, filtered (except status and state) and annotated by budget_usage_qs.

    Budget keys (ok/warn/over, no_pm, budget_total) are Admin-only; the view drops them for a PM.
    """
    counts = qs.order_by().aggregate(
        running=Count("id", filter=Q(status=ProjectStatus.RUNNING)),
        completed=Count("id", filter=Q(status=ProjectStatus.COMPLETED)),
    )
    states = {"ok": 0, "warn": 0, "over": 0}
    no_pm = 0
    budget_total = spent_total = Decimal("0")
    for spent, total, pm_id in qs.filter(status=status).values_list(
        "spent", "total_budget", "pm_id"
    ):
        states[budget_state(spent, total)] += 1
        no_pm += pm_id is None
        budget_total += total or 0
        spent_total += spent
    return {
        **counts,
        **states,
        "no_pm": no_pm,
        "budget_total": money_str(budget_total),
        "spent_total": money_str(spent_total),
    }
