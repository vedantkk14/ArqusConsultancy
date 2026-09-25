"""Real figures for the dashboard, read from the other apps' tables.

Definitions (open, overdue, aging, budget state) come from each app's own selectors so every screen
agrees. Each source is optional: a missing model (or app) leaves its part at zeros/empty. Only
aggregates and short "top N" lists are read, never whole tables.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from .services import OVERDUE_AFTER_DAYS, ZERO, money, pct, win_rate_pct

TOP_SOURCES = 5
TOP_EXECS = 5
TOP_PROJECTS = 5
TOP_OVERDUE = 3
RECENT = 5
ACTIVITY = 8


def _in(field: str, start: date | None, end: date | None) -> Q:
    cond = Q()
    if start:
        cond &= Q(**{f"{field}__gte": start})
    if end:
        cond &= Q(**{f"{field}__lte": end})
    return cond


def _month_key(value) -> str:
    return value.strftime("%Y-%m")


def _first_of(months: list[str]) -> date:
    return date(int(months[0][:4]), int(months[0][5:]), 1)


def _sum(qs, field="amount") -> Decimal:
    return Decimal(qs.aggregate(t=Sum(field))["t"] or 0)


# ---- Leads ----------


def lead_figures(rng, months: list[str]) -> dict:
    from apps.leads import selectors
    from apps.leads.models import Interaction, InteractionType, Lead, LeadSource, LeadStatus

    date_of = {
        "created_at": "created_at__date",
        "won_at": "won_at__date",
        "upd": "updated_at__date",
    }
    prev_q = _in(date_of["created_at"], rng.prev_start, rng.prev_end)
    won_q = Q(status=LeadStatus.WON) & _in(date_of["won_at"], rng.start, rng.end)
    lost_q = Q(status=LeadStatus.LOST) & _in(date_of["upd"], rng.start, rng.end)
    leads = Lead.objects
    agg = leads.aggregate(
        total=Count("id"),
        new=Count("id", filter=_in(date_of["created_at"], rng.start, rng.end)),
        new_prev=Count("id", filter=prev_q if rng.prev_start else Q(pk__isnull=True)),
        open_count=Count("id", filter=selectors.open_q()),
        open_value=Sum("proposed_amount", filter=selectors.open_q()),
        won=Count("id", filter=won_q),
        lost=Count("id", filter=lost_q),
        overdue=Count("id", filter=selectors.overdue_q(timezone.now())),
        won_awaiting=Count("id", filter=selectors.won_awaiting_q()),
    )
    by_month = {
        _month_key(r["m"]): r["n"]
        for r in leads.filter(created_at__date__gte=_first_of(months))
        .annotate(m=TruncMonth("created_at"))
        .order_by()
        .values("m")
        .annotate(n=Count("id"))
    }
    labels = dict(LeadStatus.choices)
    rows = {
        r["status"]: r
        for r in leads.order_by().values("status").annotate(n=Count("id"), v=Sum("proposed_amount"))
    }
    funnel = [
        {
            "status": s.value,
            "label": str(labels[s.value]),
            "count": rows.get(s.value, {}).get("n", 0),
            "value": money(rows.get(s.value, {}).get("v")),
        }
        for s in LeadStatus
    ]

    exec_rows = list(
        leads.filter(assigned_to__isnull=False)
        .order_by()
        .values("assigned_to", "assigned_to__first_name", "assigned_to__last_name")
        .annotate(
            won_count=Count("id", filter=won_q),
            won_value=Sum("proposed_amount", filter=won_q),
            lost_count=Count("id", filter=lost_q),
        )
        .filter(Q(won_count__gt=0) | Q(lost_count__gt=0))
    )
    total_won = sum((Decimal(r["won_value"] or 0) for r in exec_rows), ZERO)
    sales_by_exec = sorted(
        (
            {
                "user_id": r["assigned_to"],
                "name": f"{r['assigned_to__first_name']} {r['assigned_to__last_name']}".strip()
                or f"User {r['assigned_to']}",
                "won_count": r["won_count"],
                "won_value": money(r["won_value"]),
                "share_pct": pct(r["won_value"], total_won),
                "win_rate_pct": win_rate_pct(r["won_count"], r["lost_count"]),
            }
            for r in exec_rows
        ),
        key=lambda r: -Decimal(r["won_value"]),
    )[:TOP_EXECS]

    source_labels = dict(LeadSource.choices)
    src = list(
        leads.filter(_in(date_of["created_at"], rng.start, rng.end))
        .order_by()
        .values("source")
        .annotate(n=Count("id"))
        .order_by("-n")
    )
    src_total = sum(r["n"] for r in src)
    sources = [
        {
            "source": str(source_labels.get(r["source"], r["source"])),
            "count": r["n"],
            "pct": pct(r["n"], src_total),
        }
        for r in src[:TOP_SOURCES]
    ]
    if rest := sum(r["n"] for r in src[TOP_SOURCES:]):
        sources.append({"source": "Other", "count": rest, "pct": pct(rest, src_total)})

    verbs = {
        InteractionType.CALL: "called",
        InteractionType.WHATSAPP: "messaged",
        InteractionType.EMAIL: "emailed",
        InteractionType.MEETING: "met",
        InteractionType.NOTE: "added a note on",
        InteractionType.ASSIGNMENT: "assigned",
        InteractionType.AMOUNT_CHANGE: "changed the value of",
    }
    activity = []
    for i in Interaction.objects.select_related("lead", "created_by").order_by("-created_at")[
        :ACTIVITY
    ]:
        if i.type == InteractionType.STATUS_CHANGE:
            action = f"moved {i.lead.name} to {labels.get(i.to_status, i.to_status)}"
        else:
            action = f"{verbs.get(i.type, 'updated')} {i.lead.name}"
        activity.append(
            {
                "when": i.created_at.isoformat(),
                "actor": i.created_by.display_name if i.created_by else "System",
                "action": action,
                "type": "lead",
            }
        )
    return {
        **agg,
        "open_value": Decimal(agg["open_value"] or 0),
        "trend": [by_month.get(m, 0) for m in months],
        "funnel": funnel,
        "sales_by_exec": sales_by_exec,
        "sources": sources,
        "activity": activity,
    }


# ---- Projects and expenses ----------


def project_figures(rng, months: list[str]) -> dict:
    from apps.projects import selectors
    from apps.projects.models import Project, ProjectStatus

    counts = dict(Project.objects.order_by().values_list("status").annotate(n=Count("id")))
    annotated = selectors.budget_usage_qs(Project.objects.filter(status=ProjectStatus.RUNNING))
    burn = [
        {
            "id": p.id,
            "name": p.name,
            "sanctioned": money(p.sanctioned_budget),
            "spent": money(p.spent),
            "pct": selectors.usage_pct(p.spent, p.sanctioned_budget),
            "state": selectors.budget_state(p.spent, p.sanctioned_budget),
        }
        for p in annotated.order_by("-usage")[:TOP_PROJECTS]
    ]
    alerts = annotated.exclude(selectors.state_q("ok")).count()  # warn or over, as the PM sees it
    expenses = selectors.active_expenses()
    monthly = {
        _month_key(r["m"]): Decimal(r["t"] or 0)
        for r in expenses.filter(spent_on__gte=_first_of(months))
        .annotate(m=TruncMonth("spent_on"))
        .order_by()
        .values("m")
        .annotate(t=Sum("amount"))
    }
    recent = [
        {
            "date": e.spent_on.isoformat(),
            "project": e.project.name,
            "category": e.get_category_display(),
            "amount": money(e.amount),
            "at": e.created_at,
        }
        for e in expenses.select_related("project").order_by("-spent_on", "-id")[:RECENT]
    ]
    from apps.projects.models import ProjectEvent

    events = [
        {
            "when": ev.created_at.isoformat(),
            "actor": ev.actor.display_name if ev.actor else "System",
            "action": f"{ev.get_type_display().lower()}: {ev.project.name}",
            "type": "expense" if ev.type.startswith("EXPENSE") else "project",
        }
        for ev in ProjectEvent.objects.select_related("project", "actor").order_by(
            "-created_at", "-id"
        )[:ACTIVITY]
    ]
    return {
        "running": counts.get(ProjectStatus.RUNNING, 0),
        "completed": counts.get(ProjectStatus.COMPLETED, 0),
        "burn": burn,
        "over": alerts,
        "events": events,
        "spent": _sum(expenses.filter(_in("spent_on", rng.start, rng.end))),
        "spent_by_month": monthly,
        "recent_expenses": recent,
    }


# ---- Accounts ----------


def finance_figures(rng, months: list[str]) -> dict:
    from apps.accounts import selectors
    from apps.accounts.models import Ledger

    finalized = selectors.with_figures(Ledger.objects.filter(finalized_at__isnull=False))
    payments = selectors.active_payments()
    balance = list(
        finalized.filter(selectors.has_balance_q()).values_list("outstanding", "aging_base")
    )
    today = selectors.business_today()
    outstanding = sum((Decimal(o) for o, _ in balance), ZERO)
    overdue = sum(
        (Decimal(o) for o, base in balance if base and (today - base).days > OVERDUE_AFTER_DAYS),
        ZERO,
    )
    monthly = {
        _month_key(r["m"]): Decimal(r["t"] or 0)
        for r in payments.filter(received_on__gte=_first_of(months))
        .annotate(m=TruncMonth("received_on"))
        .order_by()
        .values("m")
        .annotate(t=Sum("amount"))
    }
    top = [
        {
            "ledger_id": ledger.id,
            "client": ledger.lead.name,
            "outstanding": money(ledger.outstanding),
            "days": selectors.days_since(ledger.aging_base, today) or 0,
        }
        for ledger in finalized.filter(selectors.overdue_q(today))
        .select_related("lead")
        .order_by("aging_base")[:TOP_OVERDUE]
    ]
    recent = [
        {
            "date": p.received_on.isoformat(),
            "client": p.ledger.lead.name,
            "reference": p.reference or "—",
            "amount": money(p.amount),
            "at": p.created_at,
        }
        for p in payments.select_related("ledger__lead").order_by("-received_on", "-id")[:RECENT]
    ]
    pay = payments.aggregate(
        cur=Sum("amount", filter=_in("received_on", rng.start, rng.end)),
        prev=Sum("amount", filter=_in("received_on", rng.prev_start, rng.prev_end))
        if rng.prev_start
        else Sum("amount", filter=Q(pk__isnull=True)),
        every=Sum("amount"),
    )
    received_all = Decimal(pay["every"] or 0)
    finalized_value = _sum(finalized, "total_amount")
    return {
        "received": Decimal(pay["cur"] or 0),
        "received_prev": Decimal(pay["prev"] or 0),
        "received_all": received_all,
        "finalized_value": finalized_value,
        "outstanding": outstanding,
        "outstanding_overdue": overdue,
        "outstanding_clients": len(balance),
        "aging": selectors.aging_buckets(balance),
        "received_by_month": monthly,
        "top_overdue": top,
        "overdue_count": finalized.filter(selectors.overdue_q(today)).count(),
        "recent_payments": recent,
    }
