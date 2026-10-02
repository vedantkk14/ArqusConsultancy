"""The four reports (Sales, Financial, Project margin, Lead funnel).

Same rules as the dashboard: other apps' models come from `apps.get_model` and a missing one
degrades to zeros/empty rows with `data_sources` saying so; only aggregates are read; money leaves
as strings.
Each report runs a handful of queries (see the tests' budgets).
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count, DecimalField, F, Q, Sum
from django.db.models.functions import Coalesce

from .services import (
    TREND_MONTHS,
    ZERO,
    _model,
    empty_aging,
    money,
    pct,
    period_range,
    trend_months,
    win_rate_pct,
)

PERIODS_WITH_CUSTOM = ("month", "quarter", "year", "all", "custom")
FUNNEL_STAGES = ("NEW", "CONTACTED", "INTERESTED", "WON")
FINANCE_PENDING_NOTE = "Financial figures pending accounts integration."


@dataclass(frozen=True)
class ReportPeriod:
    key: str
    start: date | None
    end: date

    def as_dict(self) -> dict:
        return {
            "period": self.key,
            "range": {
                "start": self.start.isoformat() if self.start else None,
                "end": self.end.isoformat(),
            },
        }

    def bounds(self) -> tuple[datetime | None, datetime]:
        """[start, end) as aware datetimes in the business time zone."""
        tz = ZoneInfo(getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata"))
        start = datetime.combine(self.start, time.min, tzinfo=tz) if self.start else None
        return start, datetime.combine(self.end + timedelta(days=1), time.min, tzinfo=tz)

    def q(self, field: str) -> Q:
        start, end = self.bounds()
        cond = Q(**{f"{field}__lt": end})
        return cond & Q(**{f"{field}__gte": start}) if start else cond


def business_today() -> date:
    """Today in the business time zone (the server clock is UTC; the office is not)."""
    return datetime.now(ZoneInfo(getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata"))).date()


def resolve_period(key: str, start: date | None, end: date | None, today: date) -> ReportPeriod:
    """The dashboard's period boundaries, plus `custom` from/to."""
    if key == "custom":
        return ReportPeriod("custom", start, end)
    rng = period_range(key, today)
    return ReportPeriod(key, rng.start, rng.end)


def months_for(period: ReportPeriod, today: date) -> list[str]:
    """6 months for month/quarter, 12 for a year (or all / long custom ranges)."""
    long = period.key in ("year", "all") or (
        period.start is not None and (period.end - period.start).days > 200
    )
    return trend_months(today, 12 if long else TREND_MONTHS)


# ---- Sales ------------------------------------------------------------------------------------

_MONEY = DecimalField(max_digits=14, decimal_places=2)


def won_amount_exprs(with_ledger: bool) -> tuple:
    """(current deal value, initially agreed value) of a deal (leads.Opportunity), as SQL.

    A won deal is worth its ledger total, which includes every revision; the initial value is the
    amount first finalized. Without a ledger (or before accounts exists) both are the proposal.
    """
    if not with_ledger:
        return "proposed_amount", "proposed_amount"
    current = Coalesce("ledger__total_amount", "proposed_amount", output_field=_MONEY)
    initial = Coalesce(
        "ledger__initial_amount", "ledger__total_amount", "proposed_amount", output_field=_MONEY
    )
    return current, initial


def build_sales(period: ReportPeriod) -> dict:
    """Per executive: leads worked, won, lost, conversion, won value, and running projects.

    `won_value` is the deals' current totals (revisions included), split into `initial_value` (the
    amount first finalized) and `additional_value` (added later with Revise total).
    `running_projects` counts the projects still running that came from the exec's won deals (a
    snapshot, not period-bound).
    """
    User = get_user_model()  # noqa: N806
    Lead = _model("leads", "Opportunity")  # noqa: N806 - one row per deal
    Project = _model("projects", "Project")  # noqa: N806
    current, initial = won_amount_exprs(_model("accounts", "Ledger") is not None)
    execs = list(User.objects.filter(role="SALES_EXEC").order_by("first_name", "id"))  # 1
    stats: dict[int, dict] = {}
    if Lead is not None:
        rows = (  # 2: one grouped query for every exec
            Lead.objects.filter(assigned_to__isnull=False, lead__is_deleted=False)
            .values("assigned_to")
            .annotate(
                worked=Count("id", filter=period.q("created_at")),
                won=Count("id", filter=Q(status="WON") & period.q("won_at")),
                lost=Count("id", filter=Q(status="LOST") & period.q("updated_at")),
                won_value=Sum(current, filter=Q(status="WON") & period.q("won_at")),
                initial_value=Sum(initial, filter=Q(status="WON") & period.q("won_at")),
            )
        )
        stats = {r["assigned_to"]: r for r in rows}
    running: dict[int, int] = {}
    if Project is not None:
        running = dict(  # 3: one grouped query for every exec
            Project.objects.filter(status="RUNNING", opportunity__assigned_to__isnull=False)
            .order_by()
            .values_list("opportunity__assigned_to")
            .annotate(n=Count("id"))
        )

    out, totals = (
        [],
        {"worked": 0, "won": 0, "lost": 0, "won_value": ZERO, "initial": ZERO, "running": 0},
    )
    for user in execs:
        s = stats.get(user.pk, {})
        worked, won, lost = s.get("worked", 0), s.get("won", 0), s.get("lost", 0)
        won_value = Decimal(s.get("won_value") or 0)
        initial_value = Decimal(s.get("initial_value") or 0)
        running_projects = running.get(user.pk, 0)
        out.append(
            {
                "user_id": user.pk,
                "name": user.display_name,
                "leads_worked": worked,
                "won": won,
                "lost": lost,
                "conversion_pct": win_rate_pct(won, lost),
                "initial_value": money(initial_value),
                "additional_value": money(won_value - initial_value),
                "won_value": money(won_value),
                "running_projects": running_projects,
            }
        )
        for key, value in (
            ("worked", worked),
            ("won", won),
            ("lost", lost),
            ("running", running_projects),
        ):
            totals[key] += value
        totals["won_value"] += won_value
        totals["initial"] += initial_value
    return {
        **period.as_dict(),
        "data_sources": {"leads": Lead is not None, "projects": Project is not None},
        "rows": out,
        "totals": {
            "leads_worked": totals["worked"],
            "won": totals["won"],
            "lost": totals["lost"],
            "conversion_pct": win_rate_pct(totals["won"], totals["lost"]),
            "initial_value": money(totals["initial"]),
            "additional_value": money(totals["won_value"] - totals["initial"]),
            "won_value": money(totals["won_value"]),
            "running_projects": totals["running"],
        },
    }


# ---- Financial health -------------------------------------------------------------------------


def _month_sums(qs, field: str, months: list[str]) -> list[Decimal]:
    from django.db.models.functions import TruncMonth

    first = date(int(months[0][:4]), int(months[0][5:]), 1)
    rows = (
        qs.filter(**{f"{field}__gte": first})
        .annotate(m=TruncMonth(field))
        .order_by()
        .values("m")
        .annotate(t=Sum("amount"))
    )
    by_month = {r["m"].strftime("%Y-%m"): Decimal(r["t"] or 0) for r in rows}
    return [by_month.get(m, ZERO) for m in months]


def _range_q(field: str, period: ReportPeriod) -> Q:
    cond = Q(**{f"{field}__lte": period.end})
    return cond & Q(**{f"{field}__gte": period.start}) if period.start else cond


def build_financial(period: ReportPeriod, today: date) -> dict:
    months = months_for(period, today)
    ledger, payment, expense = (
        _model("accounts", "Ledger"),
        _model("accounts", "Payment"),
        _model("projects", "Expense"),
    )
    available = ledger is not None and payment is not None
    received = spent = [ZERO] * len(months)
    received_total = spent_total = outstanding = ZERO
    aging = empty_aging()
    top: list[dict] = []
    rate = "0.0"
    if available:
        from apps.accounts import selectors as acc

        payments = acc.active_payments()
        received = _month_sums(payments, "received_on", months)
        received_total = Decimal(
            payments.filter(_range_q("received_on", period)).aggregate(t=Sum("amount"))["t"] or 0
        )
        finalized = acc.with_figures(ledger.objects.filter(finalized_at__isnull=False))
        rows = list(
            finalized.filter(acc.has_balance_q()).values_list(
                "opportunity__lead__name", "outstanding", "aging_base"
            )
        )
        outstanding = sum((Decimal(o) for _, o, _b in rows), ZERO)
        aging = acc.aging_buckets([(o, base) for _, o, base in rows])
        per_client: dict[str, list] = {}
        for name, amount, _base in rows:
            entry = per_client.setdefault(name, [0, ZERO])
            entry[0] += 1
            entry[1] += Decimal(amount)
        top = [
            {"name": n, "ledgers": c, "outstanding": money(v)}
            for n, (c, v) in sorted(per_client.items(), key=lambda kv: -kv[1][1])[:5]
        ]
        totals = finalized.aggregate(t=Sum("total_amount"))["t"]
        rate = acc.collection_rate(totals, payments.aggregate(t=Sum("amount"))["t"])
    if expense is not None:
        from apps.projects import selectors as prj

        active = prj.active_expenses()
        spent = _month_sums(active, "spent_on", months)
        spent_total = Decimal(
            active.filter(_range_q("spent_on", period)).aggregate(t=Sum("amount"))["t"] or 0
        )
    return {
        **period.as_dict(),
        "data_sources": {"accounts": available, "expenses": expense is not None},
        "note": None if available else FINANCE_PENDING_NOTE,
        "months": months,
        "received": [money(v) for v in received],
        "spent": [money(v) for v in spent],
        "totals": {
            "received": money(received_total),
            "spent": money(spent_total),
            "net": money(received_total - spent_total),
            "outstanding": money(outstanding),
            "collection_rate_pct": rate,
        },
        "aging": aging,
        "top_outstanding_clients": top,
    }


# ---- Project margin ---------------------------------------------------------------------------

MARGIN_MAX_ROWS = 200


def build_project_margin(period: ReportPeriod) -> dict:
    project = _model("projects", "Project")
    ledger = _model("accounts", "Ledger")
    rows: list[dict] = []
    if project is not None:
        from apps.projects import selectors as prj

        projects = list(prj.budget_usage_qs(project.objects.select_related("pm"))[:MARGIN_MAX_ROWS])
        finance = {}
        if ledger is not None:
            from apps.accounts import selectors as acc

            deal_ids = [p.opportunity_id for p in projects if p.opportunity_id]
            for row in acc.with_figures(
                ledger.objects.filter(opportunity_id__in=deal_ids, finalized_at__isnull=False)
            ).values("opportunity_id", "total_amount", "initial_amount", "received"):
                finance[row["opportunity_id"]] = {
                    "total_amount": row["total_amount"],
                    "initial_amount": row["initial_amount"] or row["total_amount"],
                    "received": row["received"],
                }
        for p in projects:
            fin = finance.get(p.opportunity_id)
            total = fin["total_amount"] if fin else None
            margins = prj.project_margins(fin, p.spent)
            initial_budget = fin["initial_amount"] if fin else None
            left = prj.remaining(p.spent, total)
            rows.append(
                {
                    "id": p.id,
                    "name": p.name,
                    "pm": p.pm.display_name if p.pm else "—",
                    "initial_budget": money(initial_budget) if fin else None,
                    "additional": money(total - initial_budget) if fin else None,
                    "total": money(total) if fin else None,
                    "spent": money(p.spent),
                    "remaining": None if left is None else money(left),
                    "usage_pct": prj.usage_pct(p.spent, total),
                    "received": money(fin["received"]) if fin else None,
                    **margins,
                }
            )
    linked = project is not None and ledger is not None
    return {
        **period.as_dict(),
        "data_sources": {"projects": project is not None, "accounts": ledger is not None},
        "note": None if linked else FINANCE_PENDING_NOTE,
        "rows": rows,
    }


# ---- Lead funnel ------------------------------------------------------------------------------


def build_lead_funnel(period: ReportPeriod) -> dict:
    Lead = _model("leads", "Opportunity")  # noqa: N806 - the funnel counts deals
    stages = [
        {
            "status": s,
            "label": s.title(),
            "count": 0,
            "value": money(ZERO),
            "reached": 0,
            "conversion_pct": None,
        }
        for s in FUNNEL_STAGES
    ]
    lost = {"count": 0, "value": money(ZERO)}
    sources: list[dict] = []
    if Lead is not None:
        in_period = Lead.objects.filter(period.q("created_at"), lead__is_deleted=False)
        by_status = {  # 1
            r["status"]: r
            for r in in_period.values("status").annotate(n=Count("id"), v=Sum("proposed_amount"))
        }
        labels = dict(Lead._meta.get_field("status").choices)
        for stage in stages:
            row = by_status.get(stage["status"], {})
            stage.update(
                label=str(labels.get(stage["status"], stage["label"])),
                count=row.get("n", 0),
                value=money(row.get("v")),
            )
        lost = {
            "count": by_status.get("LOST", {}).get("n", 0),
            "value": money(by_status.get("LOST", {}).get("v")),
        }
        # "Reached" counts a lead in its current stage and every later one, so it only falls.
        running = 0
        for stage in reversed(stages):
            running += stage["count"]
            stage["reached"] = running
        for prev, stage in zip(stages, stages[1:], strict=False):
            stage["conversion_pct"] = pct(stage["reached"], prev["reached"])
        source_labels = dict(_model("leads", "Lead")._meta.get_field("source").choices)
        rows = (  # 2
            in_period.values(source=F("lead__source"))
            .order_by()
            .annotate(
                leads=Count("id"),
                won=Count("id", filter=Q(status="WON")),
                value=Sum("proposed_amount"),
            )
        )
        sources = sorted(
            (
                {
                    "source": r["source"],
                    "label": str(source_labels.get(r["source"], r["source"])),
                    "leads": r["leads"],
                    "won": r["won"],
                    "conversion_pct": pct(r["won"], r["leads"]),
                    "value": money(r["value"]),
                }
                for r in rows
            ),
            key=lambda r: (-r["leads"], r["label"]),
        )
    return {
        **period.as_dict(),
        "data_sources": {"leads": Lead is not None},
        "stages": stages,
        "lost": lost,
        "sources": sources,
    }


# ---- CSV --------------------------------------------------------------------------------------


def csv_cell(value) -> str:
    """Text that a spreadsheet would run as a formula (= + - @) gets an apostrophe; numbers stay."""
    text = "" if value is None else str(value)
    if text[:1] in ("=", "+", "-", "@"):
        try:
            Decimal(text)
        except InvalidOperation:
            return "'" + text
    return text


def to_csv(header: list[str], rows: list[list]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([csv_cell(h) for h in header])
    for row in rows:
        writer.writerow([csv_cell(c) for c in row])
    return buf.getvalue()


def sales_csv(data: dict) -> str:
    head = [
        "Executive",
        "Leads worked",
        "Won",
        "Lost",
        "Conversion %",
        "Initial value",
        "Additional",
        "Won value (total)",
        "Running projects",
    ]
    rows = [
        [
            r["name"],
            r["leads_worked"],
            r["won"],
            r["lost"],
            r["conversion_pct"],
            r["initial_value"],
            r["additional_value"],
            r["won_value"],
            r["running_projects"],
        ]
        for r in data["rows"]
    ]
    t = data["totals"]
    rows.append(
        [
            "Team",
            t["leads_worked"],
            t["won"],
            t["lost"],
            t["conversion_pct"],
            t["initial_value"],
            t["additional_value"],
            t["won_value"],
            t["running_projects"],
        ]
    )
    return to_csv(head, rows)


def financial_csv(data: dict) -> str:
    rows = [
        [m, r, s] for m, r, s in zip(data["months"], data["received"], data["spent"], strict=True)
    ]
    rows += [["Aging " + a["bucket"] + " days", a["count"], a["amount"]] for a in data["aging"]]
    rows += [[c["name"], c["ledgers"], c["outstanding"]] for c in data["top_outstanding_clients"]]
    return to_csv(["Month / bucket / client", "Received / count", "Expenses / amount"], rows)


def margin_csv(data: dict) -> str:
    head = [
        "Project",
        "PM",
        "Initial budget",
        "Additional",
        "Total budget",
        "Spent",
        "Remaining",
        "Usage %",
        "Received",
        "Live margin",
    ]
    keys = [
        "name",
        "pm",
        "initial_budget",
        "additional",
        "total",
        "spent",
        "remaining",
        "usage_pct",
        "received",
        "live_margin",
    ]
    return to_csv(head, [[r.get(k) for k in keys] for r in data["rows"]])


def funnel_csv(data: dict) -> str:
    rows = [
        [s["label"], s["count"], s["value"], s["reached"], s["conversion_pct"]]
        for s in data["stages"]
    ]
    rows.append(["Lost", data["lost"]["count"], data["lost"]["value"], "", ""])
    rows += [
        [f"Source: {s['label']}", s["leads"], s["value"], s["won"], s["conversion_pct"]]
        for s in data["sources"]
    ]
    return to_csv(
        ["Stage / source", "Leads", "Proposed value", "Reached / won", "Conversion %"], rows
    )
