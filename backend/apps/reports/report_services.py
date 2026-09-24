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
from django.db.models import Count, Q, Sum

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


def build_sales(period: ReportPeriod) -> dict:
    User = get_user_model()  # noqa: N806
    Lead = _model("leads", "Lead")  # noqa: N806
    execs = list(User.objects.filter(role="SALES_EXEC").order_by("first_name", "id"))  # 1
    stats: dict[int, dict] = {}
    if Lead is not None:
        rows = (  # 2: one grouped query for every exec
            Lead.objects.filter(assigned_to__isnull=False)
            .values("assigned_to")
            .annotate(
                worked=Count("id", filter=period.q("created_at")),
                won=Count("id", filter=Q(status="WON") & period.q("won_at")),
                lost=Count("id", filter=Q(status="LOST") & period.q("updated_at")),
                won_value=Sum("proposed_amount", filter=Q(status="WON") & period.q("won_at")),
            )
        )
        stats = {r["assigned_to"]: r for r in rows}

    out, totals = [], {"worked": 0, "won": 0, "lost": 0, "won_value": ZERO, "commission": ZERO}
    for user in execs:
        s = stats.get(user.pk, {})
        worked, won, lost = s.get("worked", 0), s.get("won", 0), s.get("lost", 0)
        won_value = Decimal(s.get("won_value") or 0)
        rate = Decimal(str(user.commission_rate or 0))
        commission = won_value * rate / 100
        out.append(
            {
                "user_id": user.pk,
                "name": user.display_name,
                "leads_worked": worked,
                "won": won,
                "lost": lost,
                "conversion_pct": win_rate_pct(won, lost),
                "won_value": money(won_value),
                "commission_rate": money(rate),
                "commission": money(commission),
            }
        )
        for key, value in (("worked", worked), ("won", won), ("lost", lost)):
            totals[key] += value
        totals["won_value"] += won_value
        totals["commission"] += commission
    return {
        **period.as_dict(),
        "data_sources": {"leads": Lead is not None},
        "rows": out,
        "totals": {
            "leads_worked": totals["worked"],
            "won": totals["won"],
            "lost": totals["lost"],
            "conversion_pct": win_rate_pct(totals["won"], totals["lost"]),
            "won_value": money(totals["won_value"]),
            "commission": money(totals["commission"]),
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
                "lead__name", "outstanding", "aging_base"
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

            lead_ids = [p.lead_id for p in projects if p.lead_id]
            for row in acc.with_figures(
                ledger.objects.filter(lead_id__in=lead_ids, finalized_at__isnull=False)
            ).values("lead_id", "total_amount", "received"):
                finance[row["lead_id"]] = {
                    "total_amount": row["total_amount"],
                    "received": row["received"],
                }
        for p in projects:
            fin = finance.get(p.lead_id)
            margins = prj.project_margins(fin, p.spent, p.sanctioned_budget)
            rows.append(
                {
                    "id": p.id,
                    "name": p.name,
                    "pm": p.pm.display_name if p.pm else "—",
                    "sanctioned": money(p.sanctioned_budget),
                    "spent": money(p.spent),
                    "usage_pct": prj.usage_pct(p.spent, p.sanctioned_budget),
                    "total": money(fin["total_amount"]) if fin else None,
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
    Lead = _model("leads", "Lead")  # noqa: N806
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
        in_period = Lead.objects.filter(period.q("created_at"))
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
        source_labels = dict(Lead._meta.get_field("source").choices)
        rows = in_period.values("source").annotate(  # 2
            leads=Count("id"), won=Count("id", filter=Q(status="WON")), value=Sum("proposed_amount")
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
    head = ["Executive", "Leads worked", "Won", "Lost", "Conversion %", "Won value", "Commission"]
    rows = [
        [
            r["name"],
            r["leads_worked"],
            r["won"],
            r["lost"],
            r["conversion_pct"],
            r["won_value"],
            r["commission"],
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
            t["won_value"],
            t["commission"],
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
        "Sanctioned",
        "Spent",
        "Usage %",
        "Total",
        "Received",
        "Planned margin",
        "Live margin",
    ]
    keys = [
        "name",
        "pm",
        "sanctioned",
        "spent",
        "usage_pct",
        "total",
        "received",
        "planned_margin",
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
