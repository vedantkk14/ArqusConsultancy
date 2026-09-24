"""List filters. Query names are a contract with the dashboard links (see docs/API_CONTRACT.md)."""

from datetime import datetime, time, timedelta

from django.db.models import F, Q, QuerySet
from django.utils.dateparse import parse_date

from . import selectors
from .models import ExpenseCategory, ProjectStatus

TRUE = {"1", "true", "yes"}

PROJECT_ORDERINGS = {
    "name": [F("name").asc()],
    "-usage_pct": [F("usage").desc()],
    "-spent": [F("spent").desc()],
    "-created_at": [F("created_at").desc()],
    "expected_end_date": [F("expected_end_date").asc(nulls_last=True)],
}
DEFAULT_PROJECT_ORDERING = "-created_at"

EXPENSE_ORDERINGS = {
    "-spent_on": [F("spent_on").desc(), F("id").desc()],
    "spent_on": [F("spent_on").asc(), F("id").asc()],
    "-amount": [F("amount").desc()],
    "amount": [F("amount").asc()],
    "-created_at": [F("created_at").desc()],
}
DEFAULT_EXPENSE_ORDERING = "-spent_on"

PROJECT_SUMMARY_SKIP = ("status", "state")


def _flag(params, key) -> bool:
    return (params.get(key) or "").lower() in TRUE


def _day_start(value: str):
    day = parse_date(value or "")
    return datetime.combine(day, time.min, tzinfo=selectors.business_tz()) if day else None


def apply_project_filters(qs: QuerySet, params, skip: tuple[str, ...] = ()) -> QuerySet:
    """`qs` must be annotated with budget_usage_qs. Malformed values are ignored."""
    get = params.get
    if "status" not in skip and get("status"):
        wanted = [s for s in get("status").upper().split(",") if s in ProjectStatus.values]
        if wanted:
            qs = qs.filter(status__in=wanted)
    if get("pm") == "none":
        qs = qs.filter(pm__isnull=True)
    elif (get("pm") or "").isdigit():
        qs = qs.filter(pm_id=int(get("pm")))
    if q := (get("q") or "").strip():
        qs = qs.filter(Q(name__icontains=q) | Q(client_name__icontains=q))
    if "state" not in skip:
        if get("state") in ("ok", "warn", "over"):
            qs = qs.filter(selectors.state_q(get("state")))
        if _flag(params, "over_budget"):  # warn and over: "at or above the warning line"
            qs = qs.exclude(selectors.state_q("ok"))
        if _flag(params, "near_limit"):
            qs = qs.filter(selectors.state_q("warn"))
    if _flag(params, "no_pm"):
        qs = qs.filter(pm__isnull=True)
    if start := _day_start(get("created_from")):
        qs = qs.filter(created_at__gte=start)
    if start := _day_start(get("created_to")):
        qs = qs.filter(created_at__lt=start + timedelta(days=1))
    return qs


def apply_project_ordering(qs: QuerySet, value: str | None) -> QuerySet:
    key = value if value in PROJECT_ORDERINGS else DEFAULT_PROJECT_ORDERING
    return qs.order_by(*PROJECT_ORDERINGS[key], "-id")


def apply_expense_filters(qs: QuerySet, params) -> QuerySet:
    get = params.get
    if (get("project") or "").isdigit():
        qs = qs.filter(project_id=int(get("project")))
    if get("category"):
        wanted = [c for c in get("category").upper().split(",") if c in ExpenseCategory.values]
        if wanted:
            qs = qs.filter(category__in=wanted)
    if (get("logged_by") or "").isdigit():
        qs = qs.filter(logged_by_id=int(get("logged_by")))
    if q := (get("q") or "").strip():
        qs = qs.filter(
            Q(vendor__icontains=q) | Q(description__icontains=q) | Q(project__name__icontains=q)
        )
    if day := parse_date(get("date_from") or ""):
        qs = qs.filter(spent_on__gte=day)
    if day := parse_date(get("date_to") or ""):
        qs = qs.filter(spent_on__lte=day)
    if (get("has_receipt") or "").lower() in TRUE:
        qs = qs.exclude(receipt="")
    elif (get("has_receipt") or "").lower() in ("0", "false", "no"):
        qs = qs.filter(receipt="")
    state = get("state")
    if state == "active":
        qs = qs.filter(is_void=False)
    elif state == "void":
        qs = qs.filter(is_void=True)
    elif state == "override":
        qs = qs.filter(is_override=True, is_void=False)
    return qs


def apply_expense_ordering(qs: QuerySet, value: str | None) -> QuerySet:
    key = value if value in EXPENSE_ORDERINGS else DEFAULT_EXPENSE_ORDERING
    return qs.order_by(*EXPENSE_ORDERINGS[key])
