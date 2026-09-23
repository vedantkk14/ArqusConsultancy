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


def _model(app_label: str, model_name: str):
    """The model if the owning app has defined it yet, else None."""
    try:
        return apps.get_model(app_label, model_name)
    except LookupError:
        return None


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
    received = received_prev = outstanding = outstanding_overdue = ZERO
    outstanding_clients = 0
    received_trend = [ZERO] * len(months)
    spent_trend = [ZERO] * len(months)

    # --- Waiting on you -------------------------------------------------------------------------
    # TODO(depends on leads/projects/accounts): one count per item; only counts > 0 are sent.
    attention_counts = {
        "overdue_followups": 0,
        "won_awaiting_finalization": 0,
        "overdue_payments": 0,
        "budget_alerts": 0,
    }

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
        },
        "attention": attention_items(attention_counts),
        "funnel": funnel,
        "sales_by_exec": sales_by_exec,
        "recent": {"payments": [], "expenses": [], "activity": []},
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
