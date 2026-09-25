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


def business_today() -> date:
    """Today in the business time zone (the server clock is UTC; the office is not)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from django.conf import settings

    return datetime.now(ZoneInfo(getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata"))).date()


def build_admin_dashboard(period: str = DEFAULT_PERIOD, today: date | None = None) -> dict:
    """Everything the admin dashboard shows for `period` (shape: docs/API_CONTRACT.md)."""
    today = today or business_today()
    rng = period_range(period, today)
    months = trend_months(today)

    from . import live

    lead_model = _model("leads", "Lead")
    project_model = _model("projects", "Project")
    ledger_model = _model("accounts", "Ledger")
    payment_model = _model("accounts", "Payment")
    expense_model = _model("projects", "Expense")

    # --- Real figures. Each source is optional: a missing model leaves its part at zeros. ---------
    leads_total = leads_new = leads_new_prev = open_count = won_count = lost_count = 0
    open_value = ZERO
    leads_new_trend = [0] * len(months)
    funnel: list[dict] = []
    sales_by_exec: list[dict] = []
    lead_sources: list[dict] = []
    activity: list[dict] = []
    overdue_followups = won_awaiting = 0
    if lead_model is not None:
        f = live.lead_figures(rng, months)
        leads_total, leads_new, leads_new_prev = f["total"], f["new"], f["new_prev"]
        open_count, open_value = f["open_count"], f["open_value"]
        won_count, lost_count = f["won"], f["lost"]
        leads_new_trend, funnel = f["trend"], f["funnel"]
        sales_by_exec, lead_sources, activity = f["sales_by_exec"], f["sources"], f["activity"]
        overdue_followups, won_awaiting = f["overdue"], f["won_awaiting"]

    projects_running = projects_completed = budget_alerts = 0
    projects_burn: list[dict] = []
    spent = ZERO
    spent_trend = [ZERO] * len(months)
    recent_expenses: list[dict] = []
    project_events: list[dict] = []
    if project_model is not None and expense_model is not None:
        p = live.project_figures(rng, months)
        projects_running, projects_completed = p["running"], p["completed"]
        projects_burn, budget_alerts, spent = p["burn"], p["over"], p["spent"]
        spent_trend = [p["spent_by_month"].get(m, ZERO) for m in months]
        recent_expenses, project_events = p["recent_expenses"], p["events"]

    received = received_prev = outstanding = outstanding_overdue = ZERO
    received_all = finalized_value = ZERO
    outstanding_clients = overdue_payments = 0
    received_trend = [ZERO] * len(months)
    collections_aging = empty_aging()
    top_overdue_clients: list[dict] = []
    recent_payments: list[dict] = []
    if ledger_model is not None and payment_model is not None:
        a = live.finance_figures(rng, months)
        received, received_prev, received_all = a["received"], a["received_prev"], a["received_all"]
        finalized_value = a["finalized_value"]
        outstanding, outstanding_overdue = a["outstanding"], a["outstanding_overdue"]
        outstanding_clients, overdue_payments = a["outstanding_clients"], a["overdue_count"]
        received_trend = [a["received_by_month"].get(m, ZERO) for m in months]
        collections_aging, top_overdue_clients = a["aging"], a["top_overdue"]
        recent_payments = a["recent_payments"]
    net = received - spent

    # Payments and expenses also show up in the activity feed, newest first.
    feed = [
        {
            "when": r["at"].isoformat(),
            "actor": "Accounts",
            "action": f"received {r['amount']} from {r['client']}",
            "type": "payment",
        }
        for r in recent_payments
    ] + project_events
    activity = sorted(activity + feed, key=lambda r: r["when"], reverse=True)[:8]
    for row in recent_payments + recent_expenses:
        row.pop("at", None)

    # --- Waiting on you -------------------------------------------------------------------------
    attention_counts = {
        "overdue_followups": overdue_followups,
        "won_awaiting_finalization": won_awaiting,
        "overdue_payments": overdue_payments,
        "budget_alerts": budget_alerts,
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
        "recent": {"payments": recent_payments, "expenses": recent_expenses, "activity": activity},
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
