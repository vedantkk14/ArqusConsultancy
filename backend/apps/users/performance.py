"""Team > member detail: who someone is and how they are doing.

Leads figures come from leads (won, lost, conversion, follow-ups); project figures from projects
(delivery against the expected end date; expenses against the deal total). Other apps are read
through the registry, so a missing app leaves its block as None.
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
    deal = _model("leads", "Opportunity")
    if lead is None or deal is None:
        return None
    from apps.leads import selectors

    today, tz = _today()
    month_start = datetime.combine(today.replace(day=1), datetime.min.time(), tzinfo=tz)
    # Deals (opportunities) this user owns: repeat business with one client counts per deal.
    mine = deal.objects.filter(assigned_to=user, lead__is_deleted=False).select_related("lead")
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
    won_value = Decimal(agg["won_value"] or 0)
    lost_reasons = dict(deal._meta.get_field("lost_reason").choices)
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
            "id": x.lead_id,
            "name": x.lead.name,
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
        state = selectors.budget_state(p.spent, p.total_budget)
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
                "total_budget": None if p.total_budget is None else _money(p.total_budget),
                "spent": _money(p.spent),
                "usage_pct": selectors.usage_pct(p.spent, p.total_budget),
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
        "total_budget": _money(sum((p.total_budget or 0 for p in rows), Decimal(0))),
        "spent": _money(sum((p.spent for p in rows), Decimal(0))),
        "projects": items,
    }


def leave_records(user) -> list[dict]:
    LeaveRequest = _model("leaves", "LeaveRequest")
    if LeaveRequest is None:
        return []
    rows = LeaveRequest.objects.filter(user=user).order_by("-created_at")[:10]
    return [
        {
            "id": r.id,
            "start_date": r.start_date.isoformat(),
            "end_date": r.end_date.isoformat(),
            "days": r.days,
            "reason": r.reason,
            "status": r.status,
            "decision_note": r.decision_note,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


def member_activity(user) -> list[dict]:
    items = []

    # 1. Leave requests by this user
    LeaveRequest = _model("leaves", "LeaveRequest")
    if LeaveRequest is not None:
        for r in LeaveRequest.objects.filter(user=user).order_by("-created_at")[:10]:
            items.append({
                "when": r.created_at.isoformat(),
                "title": "Applied for leave",
                "description": f"{r.days} {'day' if r.days == 1 else 'days'} ({r.start_date} to {r.end_date}) — {r.status}",
                "icon": "event_busy",
                "tint": "amber",
                "type": "leave",
            })
            if r.decided_at:
                items.append({
                    "when": r.decided_at.isoformat(),
                    "title": f"Leave {r.status.lower()}",
                    "description": f"Leave from {r.start_date} to {r.end_date} was {r.status.lower()}" + (f": {r.decision_note}" if r.decision_note else ""),
                    "icon": "check_circle" if r.status == "APPROVED" else "cancel",
                    "tint": "teal" if r.status == "APPROVED" else "rose",
                    "type": "leave",
                })

    # 2. Audit log entries where actor was this user
    AuditLog = _model("core", "AuditLog")
    if AuditLog is not None:
        for a in AuditLog.objects.filter(actor=user).order_by("-created_at")[:20]:
            label = a.model_label.lower()
            if "leave" in label:
                continue
            if "lead" in label:
                icon, tint = "contacts", "cyan"
            elif "expense" in label:
                icon, tint = "receipt", "amber"
            elif "project" in label:
                icon, tint = "assignment", "slate"
            elif "payment" in label:
                icon, tint = "payments", "teal"
            elif "login" in label:
                icon, tint = "login", "slate"
            else:
                icon, tint = "person", "slate"

            action_text = a.action.capitalize()
            if a.action == "CREATE":
                desc = f"Created {a.object_repr}"
            elif a.action == "UPDATE":
                desc = f"Updated {a.object_repr}"
            elif a.action == "DELETE":
                desc = f"Deleted {a.object_repr}"
            else:
                desc = a.object_repr

            items.append({
                "when": a.created_at.isoformat(),
                "title": f"{action_text} {a.model_label.split('.')[-1]}",
                "description": desc,
                "icon": icon,
                "tint": tint,
                "type": label.split(".")[-1].lower(),
            })

    # 3. User login
    if user.last_login:
        items.append({
            "when": user.last_login.isoformat(),
            "title": "Last sign-in",
            "description": "User signed into ARQUS CRM",
            "icon": "login",
            "tint": "slate",
            "type": "login",
        })

    # 4. Account created
    items.append({
        "when": user.date_joined.isoformat(),
        "title": "Account created",
        "description": f"Joined team as {user.role}",
        "icon": "person_add",
        "tint": "cyan",
        "type": "user",
    })

    items.sort(key=lambda x: x["when"], reverse=True)
    seen = set()
    deduped = []
    for it in items:
        key = (it["title"], it["when"][:19])
        if key not in seen:
            seen.add(key)
            deduped.append(it)
    return deduped[:15]


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
        },
        "leads": lead_figures(user) if sales else None,
        "projects": project_figures(user) if user.role in ("PROJECT_MANAGER", "ADMIN") else None,
        "leaves": leave_records(user),
        "activity": member_activity(user),
    }
