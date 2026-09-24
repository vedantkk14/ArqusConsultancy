"""All lead writes. Views and serializers call these; nothing else writes leads."""

from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.permissions import ADMIN, SALES_EXEC, SALES_MANAGER

from . import integrations
from .exceptions import (
    DuplicateLead,
    FollowupInPast,
    FollowupOnClosed,
    HasLedger,
    InvalidTransition,
    NotWon,
    PhoneUnusable,
)
from .models import (
    Interaction,
    InteractionType,
    Lead,
    LeadStatus,
    MessageLog,
    WhatsAppTemplate,
)
from .selectors import CLOSED_STATUSES
from .utils import phone_digits

# ---- Business rules (named so they are easy to change; see docs/OPEN_DECISIONS.md) ----------

EXEC_CAN_CREATE_LEADS = False
FINAL_AMOUNT_VISIBLE_TO = {ADMIN, SALES_MANAGER}
REOPEN_ROLES = {ADMIN, SALES_MANAGER}
FOLLOWUP_TOLERANCE = timedelta(minutes=5)
BULK_ASSIGN_LIMIT = 100
COMPANY_NAME = "ARQUS Sports Consultancy"

TRANSITIONS: dict[str, set[str]] = {
    LeadStatus.NEW: {LeadStatus.CONTACTED, LeadStatus.LOST},
    LeadStatus.CONTACTED: {LeadStatus.INTERESTED, LeadStatus.WON, LeadStatus.LOST},
    LeadStatus.INTERESTED: {LeadStatus.CONTACTED, LeadStatus.WON, LeadStatus.LOST},
    LeadStatus.WON: set(),
    LeadStatus.LOST: {LeadStatus.CONTACTED},  # reopen: REOPEN_ROLES only
}
USER_INTERACTION_TYPES = {
    InteractionType.CALL,
    InteractionType.WHATSAPP,
    InteractionType.EMAIL,
    InteractionType.MEETING,
    InteractionType.NOTE,
}
# The first of these on a NEW lead moves it to CONTACTED. NOTE never changes the status.
OUTBOUND_TYPES = USER_INTERACTION_TYPES - {InteractionType.NOTE}

STATUS_ORDER = [s.value for s in LeadStatus]


def can_create(user) -> bool:
    return user.role in (ADMIN, SALES_MANAGER) or (
        user.role == SALES_EXEC and EXEC_CAN_CREATE_LEADS
    )


def can_see_final_amount(user) -> bool:
    return user.role in FINAL_AMOUNT_VISIBLE_TO


def allowed_transitions(lead: Lead, user) -> list[str]:
    allowed = set(TRANSITIONS.get(lead.status, set()))
    if lead.status == LeadStatus.LOST and user.role not in REOPEN_ROLES:
        allowed.discard(LeadStatus.CONTACTED)
    return [s for s in STATUS_ORDER if s in allowed]


# ---- Helpers ----------


def _log(lead, type_, by, notes="", **fields) -> Interaction:
    return Interaction.objects.create(lead=lead, type=type_, created_by=by, notes=notes, **fields)


def _name(user) -> str | None:
    return user.display_name if user else None


def validate_followup(lead_status: str, when: datetime | None, now: datetime | None = None) -> None:
    if when is None:
        return
    if lead_status in CLOSED_STATUSES:
        raise FollowupOnClosed()
    if when < (now or timezone.now()) - FOLLOWUP_TOLERANCE:
        raise FollowupInPast(field="next_followup_at")


def find_duplicate(phone: str, exclude_id: int | None = None) -> Lead | None:
    qs = Lead.objects.select_related("assigned_to").filter(phone=phone)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.order_by("-created_at").first()


def duplicate_summary(lead: Lead) -> dict:
    return {
        "id": lead.id,
        "name": lead.name,
        "status": lead.status,
        "assigned_to_name": _name(lead.assigned_to),
    }


def _check_assignee(user_id):
    User = get_user_model()
    user = User.objects.filter(pk=user_id, role=SALES_EXEC, is_active=True).first()
    if user is None:
        raise ValidationError({"assigned_to": ["Choose an active sales executive."]})
    return user


def _require_own_or_manager(lead: Lead, user) -> None:
    """Scoping already hides other execs' leads (404); this guards service calls made directly."""
    if user.role == SALES_EXEC and lead.assigned_to_id != user.id:
        raise PermissionDenied()


# ---- Create / update ----------


@transaction.atomic
def create_lead(data: dict, by, force: bool = False) -> Lead:
    if not can_create(by):
        raise PermissionDenied()
    duplicate = find_duplicate(data["phone"])
    if duplicate and not force:
        raise DuplicateLead(existing=duplicate_summary(duplicate))
    assignee_id = data.pop("assigned_to", None)
    assignee = _check_assignee(assignee_id) if assignee_id else None
    validate_followup(LeadStatus.NEW, data.get("next_followup_at"))
    lead = Lead.objects.create(**data, assigned_to=assignee, created_by=by)
    if assignee:
        _log(
            lead,
            InteractionType.ASSIGNMENT,
            by,
            meta={"to": assignee.id, "to_name": _name(assignee)},
        )
        integrations.notify(assignee, "lead_assigned", {"lead_id": lead.id, "lead_name": lead.name})
    return lead


@transaction.atomic
def update_lead(lead: Lead, data: dict, by) -> Lead:
    lead = Lead.objects.select_for_update().get(pk=lead.pk)
    _require_own_or_manager(lead, by)
    if "next_followup_at" in data:
        validate_followup(lead.status, data["next_followup_at"])
    if "proposed_amount" in data and data["proposed_amount"] != lead.proposed_amount:
        old = lead.proposed_amount
        new = data["proposed_amount"]
        _log(
            lead,
            InteractionType.AMOUNT_CHANGE,
            by,
            meta={
                "from": None if old is None else f"{old:.2f}",
                "to": None if new is None else f"{new:.2f}",
            },
        )
    for field, value in data.items():
        setattr(lead, field, value)
    lead.save()
    return lead


# ---- Status machine ----------


@transaction.atomic
def change_status(
    lead: Lead,
    new_status: str,
    by,
    *,
    note: str = "",
    lost_reason: str = "",
    lost_note: str = "",
    proposed_amount: Decimal | None = None,
    next_followup_at: datetime | None = None,
) -> Lead:
    lead = Lead.objects.select_for_update().get(pk=lead.pk)
    _require_own_or_manager(lead, by)
    if lead.status == new_status and new_status in CLOSED_STATUSES:
        return lead  # double click on Won / Lost: nothing happens twice
    allowed = allowed_transitions(lead, by)
    if new_status not in allowed:
        raise InvalidTransition(allowed=allowed, **{"from": lead.status, "to": new_status})

    old_status = lead.status
    meta: dict = {}
    if new_status == LeadStatus.WON:
        amount = proposed_amount if proposed_amount is not None else lead.proposed_amount
        if amount is None or amount <= 0:
            raise ValidationError(
                {"proposed_amount": ["Enter the proposed value to mark this lead won."]}
            )
        if amount != lead.proposed_amount:
            meta["amount"] = f"{amount:.2f}"
        lead.proposed_amount = amount
        lead.won_at = timezone.now()
        lead.next_followup_at = None
    elif new_status == LeadStatus.LOST:
        if not lost_reason:
            raise ValidationError({"lost_reason": ["Choose why this lead was lost."]})
        lead.lost_reason = lost_reason
        lead.lost_note = lost_note
        lead.next_followup_at = None
        meta["lost_reason"] = lost_reason
    else:
        if old_status == LeadStatus.LOST:  # reopen
            lead.lost_reason = ""
            lead.lost_note = ""
        if next_followup_at is not None:
            validate_followup(new_status, next_followup_at)
            lead.next_followup_at = next_followup_at

    lead.status = new_status
    lead.save()
    _log(
        lead,
        InteractionType.STATUS_CHANGE,
        by,
        notes=note or lost_note,
        from_status=old_status,
        to_status=new_status,
        meta=meta,
    )

    if new_status == LeadStatus.WON:
        integrations.create_ledger(lead)
        payload = {
            "lead_id": lead.id,
            "lead_name": lead.name,
            "proposed_amount": f"{lead.proposed_amount:.2f}",
            "won_by": _name(by),
        }
        for admin in get_user_model().objects.filter(role=ADMIN, is_active=True):
            integrations.notify(admin, "lead_won", payload)
    return lead


# ---- Interactions ----------


@transaction.atomic
def log_interaction(
    lead: Lead,
    by,
    *,
    type_: str,
    notes: str = "",
    next_followup_at: datetime | None = None,
    new_status: str | None = None,
    status_fields: dict | None = None,
) -> Interaction:
    if type_ not in USER_INTERACTION_TYPES:
        raise ValidationError({"type": ["This activity type is written by the system."]})
    lead = Lead.objects.select_for_update().get(pk=lead.pk)
    _require_own_or_manager(lead, by)

    interaction = _log(lead, type_, by, notes=notes)
    target = new_status
    if not target and lead.status == LeadStatus.NEW and type_ in OUTBOUND_TYPES:
        target = LeadStatus.CONTACTED
    if target and target != lead.status:
        lead = change_status(lead, target, by, **(status_fields or {}))
    if next_followup_at is not None:
        validate_followup(lead.status, next_followup_at)
        Lead.objects.filter(pk=lead.pk).update(next_followup_at=next_followup_at)
    return interaction


# ---- Assignment ----------


def _assign_one(lead: Lead, assignee, by) -> None:
    previous = lead.assigned_to
    if previous and previous.id == assignee.id:
        return
    lead.assigned_to = assignee
    lead.save(update_fields=["assigned_to", "updated_at"])
    _log(
        lead,
        InteractionType.ASSIGNMENT,
        by,
        meta={
            "from": previous.id if previous else None,
            "from_name": _name(previous),
            "to": assignee.id,
            "to_name": _name(assignee),
        },
    )
    payload = {"lead_id": lead.id, "lead_name": lead.name}
    integrations.notify(assignee, "lead_assigned", payload)
    if previous:
        integrations.notify(previous, "lead_reassigned_away", payload)


@transaction.atomic
def assign(lead: Lead, assignee_id: int, by) -> Lead:
    assignee = _check_assignee(assignee_id)
    lead = Lead.objects.select_for_update().select_related("assigned_to").get(pk=lead.pk)
    _assign_one(lead, assignee, by)
    return lead


@transaction.atomic
def bulk_assign(leads_qs, ids: list[int], assignee_id: int, by) -> int:
    if not ids:
        raise ValidationError({"ids": ["Select at least one lead."]})
    if len(ids) > BULK_ASSIGN_LIMIT:
        raise ValidationError({"ids": [f"Assign at most {BULK_ASSIGN_LIMIT} leads at a time."]})
    assignee = _check_assignee(assignee_id)
    leads = list(leads_qs.select_for_update().filter(pk__in=set(ids)))
    if len(leads) != len(set(ids)):
        raise ValidationError({"ids": ["Some leads were not found."]})
    for lead in leads:
        _assign_one(lead, assignee, by)
    return len(leads)


# ---- WhatsApp ----------


def render_template(template: WhatsAppTemplate, lead: Lead, by) -> str:
    exec_name = _name(lead.assigned_to) or _name(by) or ""
    return (
        template.body.replace("{{lead_name}}", lead.name)
        .replace("{{exec_name}}", exec_name)
        .replace("{{company}}", COMPANY_NAME)
    )


def whatsapp_preview(lead: Lead, template: WhatsAppTemplate, by) -> dict:
    """Render only; nothing is logged."""
    _require_own_or_manager(lead, by)
    digits = phone_digits(lead.phone)
    if not 8 <= len(digits) <= 15:
        raise PhoneUnusable()
    text = render_template(template, lead, by)
    return {"text": text, "url": integrations.whatsapp_provider.open_url(digits, text)}


@transaction.atomic
def whatsapp(lead: Lead, template: WhatsAppTemplate, by) -> dict:
    result = whatsapp_preview(lead, template, by)
    text = result["text"]
    MessageLog.objects.create(lead=lead, template=template, rendered_text=text, created_by=by)
    log_interaction(lead, by, type_=InteractionType.WHATSAPP, notes=f"Sent “{template.name}”")
    return result


# ---- Admin ----------


@transaction.atomic
def finalize(lead: Lead, amount: Decimal, by, note: str = ""):
    if by.role != ADMIN:
        raise PermissionDenied()
    if lead.status != LeadStatus.WON:
        raise NotWon()
    return integrations.finalize(lead, amount, by)


@transaction.atomic
def soft_delete(lead: Lead, by) -> None:
    if by.role != ADMIN:
        raise PermissionDenied()
    if integrations.has_ledger(lead):
        raise HasLedger()
    lead.delete()
