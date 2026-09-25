"""Team > member detail: who someone is and how they are doing.

Leads figures come from leads (won, lost, conversion, follow-ups); project figures from projects
(delivery against the expected end date, budget). Other apps are read through the registry, so a
missing app leaves its block as None.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.apps import apps
from django.conf import settings
from django.db.models import Count, Q, Sum
from django.utils import timezone

RECENT = 5


def _model(app: str, name: str):
    try:
        return apps.get_model(app, name)
    except LookupError:
        return None


def _money(value) -> str:
    return f"{Decimal(value or 0):.2f}"


def _pct(part, whole) -> str:
    return f"{Decimal(part) * 100 / Decimal(whole):.1f}" if whole else "0.0"


def _today():
    tz = ZoneInfo(getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata"))
    return datetime.now(tz).date(), tz


def lead_figures(user) -> dict | None:
    lead = _model("leads", "Lead")
    if lead is None:
        return None
    from apps.leads import selectors

    today, tz = _today()
    month_start = datetime.combine(today.replace(day=1), datetime.min.time(), tzinfo=tz)
    mine = lead.objects.filter(assigned_to=user)
    agg = mine.aggregate(
        assigned=Count("id"),
        open=Count("id", filter=selectors.open_q()),
        won=Count("id", filter=Q(status="WON")),
        lost=Count("id", filter=Q(status="LOST")),
        won_value=Sum("proposed_amount", filter=Q(status="WON")),
        open_value=Sum("proposed_amount", filter=selectors.open_q()),
        overdue=Count("id", filter=selectors.overdue_q()),
        won_this_month=Count("id", filter=Q(status="WON", won_at__gte=month_start)),
        created=Count("id", filter=Q(created_by=user)),
    )
    created_total = lead.objects.filter(created_by=user).count()
    rate = Decimal(str(getattr(user, "commission_rate", 0) or 0))
    won_value = Decimal(agg["won_value"] or 0)
    lost_reasons = dict(lead._meta.get_field("lost_reason").choices)
    reasons = [
        {
            "reason": str(lost_reasons.get(r["lost_reason"], r["lost_reason"] or "Not given")),
            "count": r["n"],
        }
        for r in mine.filter(status="LOST")
        .order_by()
        .values("lost_reason")
        .annotate(n=Count("id"))
        .order_by("-n")
    ]
    recent = [
        {
            "id": x.id,
            "name": x.name,
            "status": x.status,
            "value": _money(x.proposed_amount) if x.proposed_amount is not None else None,
            "when": (x.won_at or x.updated_at).isoformat(),
        }
        for x in mine.filter(status__in=("WON", "LOST")).order_by("-updated_at")[:RECENT]
    ]
    return {
        "assigned": agg["assigned"],
        "open": agg["open"],
        "won": agg["won"],
        "lost": agg["lost"],
        "conversion_pct": _pct(agg["won"], agg["won"] + agg["lost"]),
        "won_value": _money(won_value),
        "open_value": _money(agg["open_value"]),
        "overdue_followups": agg["overdue"],
        "won_this_month": agg["won_this_month"],
        "leads_created": created_total,
        "commission_earned": _money(won_value * rate / 100) if user.role == "SALES_EXEC" else None,
        "lost_reasons": reasons,
        "recent_closed": recent,
    }


def project_figures(user) -> dict | None:
    project = _model("projects", "Project")
    if project is None:
        return None
    from apps.projects import selectors

    today, tz = _today()
    rows = list(selectors.budget_usage_qs(project.objects.filter(pm=user)).order_by("-created_at"))
    on_time = late = no_deadline = running_overdue = over_budget = 0
    items = []
    for p in rows:
        deadline = p.expected_end_date.isoformat() if p.expected_end_date else None
        state = selectors.budget_state(p.spent, p.sanctioned_budget)
        over_budget += state == "over"
        if p.status == "COMPLETED":
            done = timezone.localtime(p.completed_at, tz).date() if p.completed_at else None
            if not p.expected_end_date or not done:
                delivery = "no_deadline"
                no_deadline += 1
            elif done <= p.expected_end_date:
                delivery = "on_time"
                on_time += 1
            else:
                delivery = "late"
                late += 1
        elif p.expected_end_date and p.expected_end_date < today:
            delivery = "overdue"
            running_overdue += 1
        else:
            delivery = "in_progress"
        items.append(
            {
                "id": p.id,
                "name": p.name,
                "status": p.status,
                "expected_end_date": deadline,
                "completed_on": timezone.localtime(p.completed_at, tz).date().isoformat()
                if p.completed_at
                else None,
                "delivery": delivery,
                "sanctioned": _money(p.sanctioned_budget),
                "spent": _money(p.spent),
                "usage_pct": selectors.usage_pct(p.spent, p.sanctioned_budget),
                "budget_state": state,
            }
        )
    completed = sum(1 for p in rows if p.status == "COMPLETED")
    judged = on_time + late
    return {
        "managed": len(rows),
        "running": len(rows) - completed,
        "completed": completed,
        "completed_on_time": on_time,
        "completed_late": late,
        "completed_no_deadline": no_deadline,
        "on_time_pct": _pct(on_time, judged),
        "running_overdue": running_overdue,
        "over_budget": over_budget,
        "sanctioned": _money(sum((p.sanctioned_budget for p in rows), Decimal(0))),
        "spent": _money(sum((p.spent for p in rows), Decimal(0))),
        "projects": items,
    }


def member_performance(user) -> dict:
    sales = user.role in ("SALES_EXEC", "SALES_MANAGER", "ADMIN")
    return {
        "user": {
            "id": user.id,
            "name": user.display_name,
            "username": user.username,
            "email": user.email,
            "phone": user.phone,
            "role": user.role,
            "is_active": user.is_active,
            "date_joined": user.date_joined.isoformat(),
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "commission_rate": f"{Decimal(str(user.commission_rate)):.2f}"
            if user.role == "SALES_EXEC"
            else None,
        },
        "leads": lead_figures(user) if sales else None,
        "projects": project_figures(user) if user.role in ("PROJECT_MANAGER", "ADMIN") else None,
    }
