"""Reports and dashboards (Dev C).

The admin dashboard reads other apps' models through `apps.get_model`, so this app never imports
them and keeps working while those models don't exist yet. Every figure is an aggregate; money
leaves this module as a string with 2 decimals.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.apps import apps
from django.utils import timezone

# ---- Definitions (one place each) ----------------------------------------------------------------

PERIODS = ("month", "quarter", "year", "all")
DEFAULT_PERIOD = "month"

#: "Year" and quarters follow the Indian financial year (April to March). See OPEN_DECISIONS.md.
FINANCIAL_YEAR_START_MONTH = 4

#: An unpaid balance is overdue once the ledger is older than this many days.
OVERDUE_AFTER_DAYS = 30

#: An open lead ("active opportunity") is any lead whose status is not one of these.
LEAD_CLOSED_STATUSES = ("WON", "LOST")

#: Months shown in sparklines and the revenue vs expenses chart.
TREND_MONTHS = 6

#: Collections aging buckets: days since the last payment (or ledger creation) of an unpaid ledger.
AGING_BUCKETS = (("0-30", 0, 30), ("31-60", 31, 60), ("61-90", 61, 90), ("90+", 91, None))

#: Budget usage (spent / sanctioned budget, %) at which a running project is "warn" / "over".
BURN_WARN_PCT = Decimal("80")
BURN_OVER_PCT = Decimal("100")

TWO_PLACES = Decimal("0.01")
ONE_PLACE = Decimal("0.1")
ZERO = Decimal("0")


@dataclass(frozen=True)
class PeriodRange:
    """Inclusive date range of the selected period and the previous period it is compared with."""

    start: date | None
    end: date
    prev_start: date | None
    prev_end: date | None


def _add_months(day: date, months: int) -> date:
    index = day.year * 12 + (day.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


def period_range(period: str, today: date) -> PeriodRange:
    """Current period to date, and the full previous period of the same kind.

    month   -> 1st of this month .. today;          previous = last calendar month
    quarter -> 1st of this FY quarter .. today;     previous = the quarter before
    year    -> 1 April of this FY .. today;         previous = the whole previous FY
    all     -> everything;                          no previous period
    """
    if period == "all":
        return PeriodRange(None, today, None, None)
    if period == "month":
        length = 1
        start = today.replace(day=1)
    elif period == "quarter":
        length = 3
        offset = (today.month - FINANCIAL_YEAR_START_MONTH) % 3
        start = _add_months(today.replace(day=1), -offset)
    elif period == "year":
        length = 12
        offset = (today.month - FINANCIAL_YEAR_START_MONTH) % 12
        start = _add_months(today.replace(day=1), -offset)
    else:
        raise ValueError(f"Unknown period: {period}")
    prev_start = _add_months(start, -length)
    return PeriodRange(start, today, prev_start, start - timedelta(days=1))


def trend_months(today: date, count: int = TREND_MONTHS) -> list[str]:
    """The last `count` calendar months ending with the current one, as "YYYY-MM"."""
    first = today.replace(day=1)
    return [_add_months(first, -i).strftime("%Y-%m") for i in reversed(range(count))]


def money(value: Decimal | int | None) -> str:
    """Decimal -> "1234.50" (2 places, half-up). None counts as zero."""
    return str(Decimal(value or 0).quantize(TWO_PLACES, rounding=ROUND_HALF_UP))


def win_rate_pct(won: int, lost: int) -> str:
    """won / (won + lost) as a percentage with one decimal; "0.0" when nothing has been decided."""
    decided = won + lost
    if decided == 0:
        return "0.0"
    return str((Decimal(won) * 100 / decided).quantize(ONE_PLACE, rounding=ROUND_HALF_UP))


def delta_pct(current: Decimal, previous: Decimal, period: str) -> str | None:
    """Percentage change against the previous period, one decimal ("12.4", "-3.1").

    None when there is nothing to compare: the "all" period, or a previous value of zero.
    """
    if period == "all" or previous == 0:
        return None
    change = (Decimal(current) - Decimal(previous)) * 100 / Decimal(previous)
    return str(change.quantize(ONE_PLACE, rounding=ROUND_HALF_UP))


def pct(part, whole) -> str:
    """part / whole as a percentage string with one decimal; "0.0" when whole is zero."""
    whole = Decimal(whole or 0)
    if whole == 0:
        return "0.0"
    return str((Decimal(part or 0) * 100 / whole).quantize(ONE_PLACE, rounding=ROUND_HALF_UP))


def collection_rate_pct(received_total, finalized_value) -> str:
    """All money received / total finalized project value (snapshot), one decimal."""
    return pct(received_total, finalized_value)


def aging_bucket(days: int) -> str:
    """The AGING_BUCKETS label for an age in days."""
    for label, low, high in AGING_BUCKETS:
        if days >= low and (high is None or days <= high):
            return label
    return AGING_BUCKETS[0][0]


def burn_state(spent, sanctioned) -> str:
    """ok < 80% <= warn < 100% <= over, measured against the sanctioned budget only."""
    sanctioned = Decimal(sanctioned or 0)
    if sanctioned <= 0:
        return "ok"
    usage = Decimal(spent or 0) * 100 / sanctioned  # exact, not the rounded display value
    if usage >= BURN_OVER_PCT:
        return "over"
    return "warn" if usage >= BURN_WARN_PCT else "ok"


def empty_aging() -> list[dict]:
    return [{"bucket": label, "count": 0, "amount": money(ZERO)} for label, _, _ in AGING_BUCKETS]


def _model(app_label: str, model_name: str):
    """The model if the owning app has defined it yet, else None."""
    try:
        return apps.get_model(app_label, model_name)
    except LookupError:
        return None


def _account_figures(rng: PeriodRange, months: list[str]) -> dict | None:
    """Received, outstanding, overdue and aging for the dashboard, or None until accounts exist.

    Every number comes from accounts.selectors, so the dashboard and Accounts always agree.
    """
    ledger_model = _model("accounts", "Ledger")
    payment_model = _model("accounts", "Payment")
    if ledger_model is None or payment_model is None:
        return None
    from django.db.models import Sum
    from django.db.models.functions import TruncMonth

    from apps.accounts import selectors as acs

    summary = acs.summary(acs.with_figures(ledger_model.objects.select_related("lead")))
    live = payment_model.objects.filter(is_void=False)

    def total(start, end):
        qs = live if end is None else live.filter(received_on__lte=end)
        if start:
            qs = qs.filter(received_on__gte=start)
        return qs.aggregate(t=Sum("amount"))["t"] or ZERO

    per_month = {
        row["m"].strftime("%Y-%m"): row["t"]
        for row in live.filter(received_on__gte=f"{months[0]}-01")
        .annotate(m=TruncMonth("received_on"))
        .values("m")
        .annotate(t=Sum("amount"))
    }
    recent = [
        {
            "date": p.received_on.isoformat(),
            "client": p.ledger.lead.name,
            "reference": p.reference,
            "amount": money(p.amount),
        }
        for p in live.select_related("ledger__lead").order_by("-received_on", "-id")[:5]
    ]
    return {
        "received": total(rng.start, rng.end),
        "received_prev": total(rng.prev_start, rng.prev_end) if rng.prev_end else ZERO,
        "received_all": Decimal(summary["received"]),
        "finalized_value": Decimal(summary["total_value"]),
        "outstanding": Decimal(summary["outstanding"]),
        "outstanding_overdue": Decimal(summary["overdue_amount"]),
        "outstanding_clients": summary["clients_with_balance"],
        "received_trend": [per_month.get(m, ZERO) for m in months],
        "aging": summary["aging"],
        "top_overdue": [
            {
                "ledger_id": t["ledger"],
                "client": t["client"],
                "outstanding": t["outstanding"],
                "days": t["days_since"],
            }
            for t in summary["top_overdue"]
        ],
        "recent_payments": recent,
        "overdue_clients": summary["overdue_clients"],
        "awaiting_finalization": summary["awaiting_finalization"],
    }


def _project_figures(rng: PeriodRange, months: list[str]) -> dict | None:
    """Projects and expenses figures for the admin dashboard, or None until those models exist.

    Budget state comes from projects.selectors so the admin and the project manager always agree.
    """
    project_model = _model("projects", "Project")
    expense_model = _model("projects", "Expense")
    event_model = _model("projects", "ProjectEvent")
    if project_model is None or expense_model is None:
        return None
    from django.db.models import Count, Q, Sum
    from django.db.models.functions import TruncMonth

    from apps.projects import selectors as ps

    counts = project_model.objects.aggregate(
        running=Count("id", filter=Q(status="RUNNING")),
        completed=Count("id", filter=Q(status="COMPLETED")),
    )
    running = list(
        ps.budget_usage_qs(project_model.objects.filter(status="RUNNING")).order_by("-usage", "id")
    )
    burn = [
        {
            "id": p.pk,
            "name": p.name,
            "sanctioned": money(p.sanctioned_budget),
            "spent": money(p.spent),
            "pct": ps.usage_pct(p.spent, p.sanctioned_budget),
            "state": ps.budget_state(p.spent, p.sanctioned_budget),
        }
        for p in running
    ]
    live = expense_model.objects.filter(is_void=False)
    in_period = live.filter(spent_on__lte=rng.end)
    if rng.start:
        in_period = in_period.filter(spent_on__gte=rng.start)
    per_month = {
        row["m"].strftime("%Y-%m"): row["t"]
        for row in live.filter(spent_on__gte=f"{months[0]}-01")
        .annotate(m=TruncMonth("spent_on"))
        .values("m")
        .annotate(t=Sum("amount"))
    }
    recent_expenses = [
        {
            "date": e.spent_on.isoformat(),
            "project": e.project.name,
            "category": e.get_category_display(),
            "amount": money(e.amount),
        }
        for e in live.select_related("project").order_by("-spent_on", "-id")[:5]
    ]
    activity = []
    if event_model is not None:
        for ev in event_model.objects.select_related("project", "actor").order_by(
            "-created_at", "-id"
        )[:8]:
            activity.append(
                {
                    "when": ev.created_at.isoformat(),
                    "actor": ev.actor.display_name if ev.actor else "System",
                    "action": f"{ev.get_type_display().lower()}: {ev.project.name}",
                    "type": "expense" if ev.type.startswith("EXPENSE") else "project",
                }
            )
    return {
        "running": counts["running"],
        "completed": counts["completed"],
        "spent": in_period.aggregate(t=Sum("amount"))["t"] or ZERO,
        "spent_trend": [per_month.get(m, ZERO) for m in months],
        "burn": burn[:5],
        "alerts": sum(1 for p in burn if p["state"] != "ok"),
        "budget_alerts": sum(b["state"] != "ok" for b in burn),
        "recent_expenses": recent_expenses,
        "activity": activity,
    }


# ---- Dashboard -----------------------------------------------------------------------------------


def build_admin_dashboard(period: str = DEFAULT_PERIOD, today: date | None = None) -> dict:
    """Everything the admin dashboard shows for `period` (shape: docs/API_CONTRACT.md)."""
    today = today or timezone.localdate()
    rng = period_range(period, today)
    months = trend_months(today)

    lead_model = _model("leads", "Lead")
    project_model = _model("projects", "Project")
    ledger_model = _model("accounts", "Ledger")
    payment_model = _model("accounts", "Payment")
    expense_model = _model("projects", "Expense")

    # --- Leads ---------------------------------------------------------------------------------
    # TODO(depends on leads.Lead, Dev A): with the model in place, fill these with aggregates:
    #   leads_total    = Lead.objects.count() (all-time snapshot)
    #   leads_new      = created in [rng.start, rng.end]; leads_new_prev over the previous range
    #   open_count     = status not in LEAD_CLOSED_STATUSES
    #   open_value     = Sum("proposed_amount") over open leads, missing amounts count as 0
    #   won/lost_count = status WON / LOST, decided within the period
    #   trends.leads_new, funnel, sales_by_exec: one values()/annotate() query each
    leads_total = leads_new = leads_new_prev = open_count = won_count = lost_count = 0
    open_value = ZERO
    leads_new_trend = [0] * len(months)
    funnel: list[dict] = []
    sales_by_exec: list[dict] = []

    # --- Projects ------------------------------------------------------------------------------
    # TODO(depends on projects.Project, Dev B): snapshots, not period-based:
    #   projects_running = status != COMPLETED;  projects_completed = status == COMPLETED
    projects_running = projects_completed = 0

    # --- Accounts ------------------------------------------------------------------------------
    # TODO(depends on accounts.Ledger / accounts.Payment, Dev C):
    #   received / received_prev = Sum(Payment.amount) in the period / previous period
    #   outstanding         = Sum(ledger total - payments) over ledgers with a positive balance
    #   outstanding_clients = distinct customers of those ledgers
    #   outstanding_overdue = the part of `outstanding` on ledgers older than OVERDUE_AFTER_DAYS
    #   trends.received and cashflow.collected = payments per month
    #   cashflow.spent = expenses per month
    #   spent (period) = Sum(Expense.amount) in the period; net = received - spent
    #   collection_rate_pct = all payments / Sum(finalized ledger total) (snapshot)
    #   collections_aging / top_overdue_clients: unpaid ledgers by days since the last payment
    #     (or ledger creation), bucketed with aging_bucket(); top 3 by days
    received = received_prev = outstanding = outstanding_overdue = spent = ZERO
    received_all = finalized_value = ZERO
    outstanding_clients = 0
    received_trend = [ZERO] * len(months)
    spent_trend = [ZERO] * len(months)
    collections_aging = empty_aging()
    top_overdue_clients: list[dict] = []
    acc = _account_figures(rng, months)
    if acc:
        received, received_prev = acc["received"], acc["received_prev"]
        received_all, finalized_value = acc["received_all"], acc["finalized_value"]
        outstanding, outstanding_overdue = acc["outstanding"], acc["outstanding_overdue"]
        outstanding_clients, received_trend = acc["outstanding_clients"], acc["received_trend"]
        collections_aging, top_overdue_clients = acc["aging"], acc["top_overdue"]
    proj = _project_figures(rng, months)
    if proj:
        projects_running, projects_completed = proj["running"], proj["completed"]
        spent, spent_trend = proj["spent"], proj["spent_trend"]
    net = received - spent

    # TODO(depends on projects.Project / projects.Expense, Dev B): projects_burn = up to 5 running
    #   projects by spent / sanctioned_budget (never the total project amount),
    #   state = burn_state().
    projects_burn: list[dict] = proj["burn"] if proj else []

    # TODO(depends on leads.Lead.source, Dev A): lead_sources = top 5 sources + "Other", with pct().
    lead_sources: list[dict] = []

    # --- Waiting on you -------------------------------------------------------------------------
    # TODO(depends on leads/projects/accounts): one count per item; only counts > 0 are sent.
    attention_counts = {
        "overdue_followups": 0,
        "won_awaiting_finalization": 0,
        "overdue_payments": 0,
        "budget_alerts": proj["budget_alerts"] if proj else 0,
    }
    if proj:
        attention_counts["budget_alerts"] = proj["alerts"]
    if acc:
        attention_counts["overdue_payments"] = acc["overdue_clients"]
        attention_counts["won_awaiting_finalization"] = acc["awaiting_finalization"]

    return {
        "period": period,
        "range": {
            "start": rng.start.isoformat() if rng.start else None,
            "end": rng.end.isoformat(),
            "prev_start": rng.prev_start.isoformat() if rng.prev_start else None,
            "prev_end": rng.prev_end.isoformat() if rng.prev_end else None,
        },
        "data_sources": {
            "leads": lead_model is not None,
            "projects": project_model is not None,
            "accounts": ledger_model is not None and payment_model is not None,
            "expenses": expense_model is not None,
        },
        "kpis": {
            "received": money(received),
            "received_prev": money(received_prev),
            "received_delta_pct": delta_pct(received, received_prev, period),
            "outstanding": money(outstanding),
            "outstanding_clients": outstanding_clients,
            "outstanding_overdue": money(outstanding_overdue),
            "leads_total": leads_total,
            "leads_new": leads_new,
            "leads_new_prev": leads_new_prev,
            "open_count": open_count,
            "open_value": money(open_value),
            "won_count": won_count,
            "lost_count": lost_count,
            "win_rate_pct": win_rate_pct(won_count, lost_count),
            "projects_running": projects_running,
            "projects_completed": projects_completed,
            "spent": money(spent),
            "net": money(net),
            "net_margin_pct": pct(net, received),
            "collection_rate_pct": collection_rate_pct(received_all, finalized_value),
        },
        "trends": {
            "months": months,
            "leads_new": leads_new_trend,
            "received": [money(v) for v in received_trend],
        },
        "cashflow": {
            "months": months,
            "collected": [money(v) for v in received_trend],
            "spent": [money(v) for v in spent_trend],
            "net": [money(r - s) for r, s in zip(received_trend, spent_trend, strict=True)],
        },
        "attention": attention_items(attention_counts),
        # funnel items: {status, label, count, value};
        # sales_by_exec items: {user_id, name, won_count, won_value, share_pct, win_rate_pct}
        "funnel": funnel,
        "sales_by_exec": sales_by_exec,
        "lead_sources": lead_sources,
        "collections_aging": collections_aging,
        "top_overdue_clients": top_overdue_clients,
        "projects_burn": projects_burn,
        # activity items: {when, actor, action, type}; type is lead|payment|expense|project|user
        "recent": {
            "payments": acc["recent_payments"] if acc else [],
            "expenses": proj["recent_expenses"] if proj else [],
            "activity": proj["activity"] if proj else [],
        },
    }


def attention_items(counts: dict[str, int]) -> list[dict]:
    """'Waiting on you' rows for the counts above zero, most severe first."""
    order = {"high": 0, "medium": 1, "low": 2}
    rows = [
        {**ATTENTION_ITEMS[key], "key": key, "count": count}
        for key, count in counts.items()
        if count > 0
    ]
    return sorted(rows, key=lambda row: order[row["severity"]])


#: Label, severity and target page of each "Waiting on you" item.
ATTENTION_ITEMS = {
    "overdue_payments": {
        "label": "Payments overdue",
        "severity": "high",
        "route": "/accounts/pending",
    },
    "overdue_followups": {
        "label": "Overdue follow-ups",
        "severity": "high",
        "route": "/leads/overdue",
    },
    "budget_alerts": {
        "label": "Projects over budget",
        "severity": "medium",
        "route": "/expenses/alerts",
    },
    "won_awaiting_finalization": {
        "label": "Won deals awaiting finalisation",
        "severity": "medium",
        "route": "/leads/won-awaiting",
    },
}
