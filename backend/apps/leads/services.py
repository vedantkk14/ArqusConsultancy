"""All lead writes. Views and serializers call these; nothing else writes leads.

A Lead is the client; each deal with it is an Opportunity. The status machine, follow-ups,
interactions, WhatsApp and the won-deal hand-off to accounts all work on one Opportunity; the lead
supplies the contact details. A lead has at most one open (not WON/LOST) deal at a time.
"""

import logging
import threading
from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.permissions import ADMIN, SALES_EXEC, SALES_MANAGER

from . import integrations
from .exceptions import (
    DuplicateLead,
    EmailSendFailed,
    EmailUnusable,
    FollowupInPast,
    FollowupOnClosed,
    HasLedger,
    HasPayments,
    InvalidTransition,
    NotWon,
    OpportunityOpen,
    PhoneUnusable,
)
from .models import (
    CallScript,
    EmailTemplate,
    Interaction,
    InteractionType,
    Lead,
    LeadStatus,
    MessageLog,
    Opportunity,
    WhatsAppTemplate,
)
from .selectors import CLOSED_STATUSES
from .utils import phone_digits

logger = logging.getLogger(__name__)

# ---- Business rules (named so they are easy to change; see docs/OPEN_DECISIONS.md) ----------

EXEC_CAN_CREATE_LEADS = False
FINAL_AMOUNT_VISIBLE_TO = {ADMIN, SALES_MANAGER}
#: Who may finalize a won deal's total (the first close). Revising it afterwards stays Admin-only.
FINALIZE_ROLES = {ADMIN, SALES_MANAGER}
#: Who may start a new deal (opportunity) with an existing lead.
NEW_OPPORTUNITY_ROLES = {ADMIN, SALES_MANAGER}
REOPEN_ROLES = {ADMIN, SALES_MANAGER}
# A won deal is not final until money arrives, so a manager can still mark it lost.
WON_TO_LOST_ROLES = {ADMIN, SALES_MANAGER}
FOLLOWUP_TOLERANCE = timedelta(minutes=5)
BULK_ASSIGN_LIMIT = 100
# Who can own a lead: sales execs, and admins who work a lead themselves.
ASSIGNEE_ROLES = (SALES_EXEC, ADMIN)
COMPANY_NAME = "ARQUS Sports Consultancy"
#: Fields of a create/update payload that belong to the deal, not the client record.
DEAL_FIELDS = ("next_followup_at", "proposed_amount")

TRANSITIONS: dict[str, set[str]] = {
    LeadStatus.NEW: {LeadStatus.CONTACTED, LeadStatus.LOST},
    LeadStatus.CONTACTED: {LeadStatus.INTERESTED, LeadStatus.WON, LeadStatus.LOST},
    LeadStatus.INTERESTED: {LeadStatus.WON, LeadStatus.LOST},  # no way back to Contacted
    LeadStatus.WON: {LeadStatus.LOST},  # WON_TO_LOST_ROLES only, and only before any payment
    LeadStatus.LOST: {LeadStatus.CONTACTED},  # reopen: REOPEN_ROLES only
}
USER_INTERACTION_TYPES = {
    InteractionType.CALL,
    InteractionType.WHATSAPP,
    InteractionType.EMAIL,
    InteractionType.MEETING,
    InteractionType.NOTE,
}
# The first of these on a NEW deal moves it to CONTACTED. NOTE never changes the status.
OUTBOUND_TYPES = USER_INTERACTION_TYPES - {InteractionType.NOTE}

STATUS_ORDER = [s.value for s in LeadStatus]


def can_create(user) -> bool:
    return user.role in (ADMIN, SALES_MANAGER) or (
        user.role == SALES_EXEC and EXEC_CAN_CREATE_LEADS
    )


def can_see_final_amount(user) -> bool:
    return user.role in FINAL_AMOUNT_VISIBLE_TO


def can_finalize(user) -> bool:
    return user.role in FINALIZE_ROLES


def can_start_opportunity(user) -> bool:
    return user.role in NEW_OPPORTUNITY_ROLES


def allowed_transitions(deal, user) -> list[str]:
    """`deal` is an Opportunity, or a Lead annotated with its current deal's status."""
    status = getattr(deal, "status", None)
    if status is None:
        return []
    allowed = set(TRANSITIONS.get(status, set()))
    if status == LeadStatus.LOST and user.role not in REOPEN_ROLES:
        allowed.discard(LeadStatus.CONTACTED)
    if status == LeadStatus.WON and user.role not in WON_TO_LOST_ROLES:
        allowed.discard(LeadStatus.LOST)
    return [s for s in STATUS_ORDER if s in allowed]


def is_open(deal) -> bool:
    return deal is not None and deal.status not in CLOSED_STATUSES


# ---- Helpers ----------


def _log(opportunity, type_, by, notes="", **fields) -> Interaction:
    return Interaction.objects.create(
        opportunity=opportunity, type=type_, created_by=by, notes=notes, **fields
    )


def _name(user) -> str | None:
    return user.display_name if user else None


def _payload(opportunity, **extra) -> dict:
    return {
        "lead_id": opportunity.lead_id,
        "lead_name": opportunity.lead.name,
        "opportunity_id": opportunity.pk,
        **extra,
    }


def validate_followup(lead_status: str, when: datetime | None, now: datetime | None = None) -> None:
    if when is None:
        return
    if lead_status in CLOSED_STATUSES:
        raise FollowupOnClosed()
    if when < (now or timezone.now()) - FOLLOWUP_TOLERANCE:
        raise FollowupInPast(field="next_followup_at")


def find_duplicate(phone: str, exclude_id: int | None = None) -> Lead | None:
    qs = Lead.objects.select_related("assigned_to", "current_opportunity").filter(phone=phone)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.order_by("-created_at").first()


def duplicate_summary(lead: Lead) -> dict:
    current = lead.current_opportunity
    return {
        "id": lead.id,
        "name": lead.name,
        "status": current.status if current else None,
        "assigned_to_name": _name(lead.assigned_to),
    }


def _check_assignee(user_id):
    User = get_user_model()
    user = User.objects.filter(pk=user_id, role__in=ASSIGNEE_ROLES, is_active=True).first()
    if user is None:
        raise ValidationError({"assigned_to": ["Choose an active sales executive or admin."]})
    return user


def _require_own_or_manager(lead: Lead, user) -> None:
    """Scoping already hides other execs' leads (404); this guards service calls made directly."""
    if user.role == SALES_EXEC and lead.assigned_to_id != user.id:
        raise PermissionDenied()


def _lock_deal(opportunity) -> Opportunity:
    return (
        Opportunity.objects.select_for_update()
        .select_related("lead", "lead__assigned_to", "assigned_to")
        .get(pk=opportunity.pk)
    )


def current_opportunity(lead: Lead) -> Opportunity | None:
    if lead.current_opportunity_id is None:
        return None
    return (
        Opportunity.objects.select_related("lead", "assigned_to")
        .filter(pk=lead.current_opportunity_id)
        .first()
    )


# ---- Opportunities ----------


def add_opportunity(lead: Lead, *, by=None, **fields) -> Opportunity:
    """Low level: create the lead's next deal and make it the current one. No rule checks - use
    start_opportunity() for the user-facing flow. Also used by seeds and test fixtures."""
    last = Opportunity.all_objects.filter(lead=lead).aggregate(m=Max("sequence_no"))["m"] or 0
    fields.setdefault("assigned_to", lead.assigned_to)
    opportunity = Opportunity.objects.create(
        lead=lead, sequence_no=last + 1, created_by=by, **fields
    )
    Lead.all_objects.filter(pk=lead.pk).update(current_opportunity=opportunity)
    lead.current_opportunity = opportunity
    return opportunity


@transaction.atomic
def start_opportunity(
    lead: Lead,
    by,
    *,
    assigned_to: int | None = None,
    requirements: str = "",
    next_followup_at=None,
):
    """A new deal with an existing client. Only one open deal per lead: 409 opportunity_open."""
    if not can_start_opportunity(by):
        raise PermissionDenied()
    lead = Lead.objects.select_for_update().select_related("assigned_to").get(pk=lead.pk)
    open_deal = (
        Opportunity.objects.filter(lead=lead)
        .exclude(status__in=CLOSED_STATUSES)
        .order_by("-sequence_no")
        .first()
    )
    if open_deal is not None:
        raise OpportunityOpen(opportunity_id=open_deal.pk)
    if next_followup_at is not None:
        validate_followup(LeadStatus.NEW, next_followup_at)
    assignee = _check_assignee(assigned_to) if assigned_to else lead.assigned_to
    opportunity = add_opportunity(
        lead,
        by=by,
        assigned_to=assignee,
        requirements=(requirements or "").strip(),
        next_followup_at=next_followup_at,
    )
    if assignee and assignee.pk != lead.assigned_to_id:
        lead.assigned_to = assignee
        lead.save(update_fields=["assigned_to", "updated_at"])
    if assignee:
        _log(
            opportunity,
            InteractionType.ASSIGNMENT,
            by,
            meta={"to": assignee.id, "to_name": _name(assignee)},
        )
        if assignee.pk != by.pk:
            integrations.notify(assignee, "lead_assigned", _payload(opportunity))
    _notify_managers("lead_repeat_deal", _payload(opportunity, started_by=_name(by)), by)
    return opportunity


def _notify_managers(type_: str, payload: dict, by=None) -> None:
    """Sales managers follow the team's deals; the person who did it is not told about their own act."""
    for manager in get_user_model().objects.filter(role=SALES_MANAGER, is_active=True):
        if by is None or manager.pk != by.pk:
            integrations.notify(manager, type_, payload)


def notify_import(by, count: int) -> None:
    """One summary notification per admin and sales manager once a bulk import has finished."""
    if count <= 0:
        return
    payload = {
        "summary": f"{count} new {'lead' if count == 1 else 'leads'}",
        "imported_by": _name(by),
        "count": count,
    }
    for user in get_user_model().objects.filter(role__in=(ADMIN, SALES_MANAGER), is_active=True):
        integrations.notify(user, "lead_imported", payload)


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
    deal = {f: data.pop(f) for f in DEAL_FIELDS if f in data}
    validate_followup(LeadStatus.NEW, deal.get("next_followup_at"))
    lead = Lead.objects.create(**data, assigned_to=assignee, created_by=by)
    opportunity = add_opportunity(lead, by=by, assigned_to=assignee, **deal)
    if assignee:
        _log(
            opportunity,
            InteractionType.ASSIGNMENT,
            by,
            meta={"to": assignee.id, "to_name": _name(assignee)},
        )
        integrations.notify(assignee, "lead_assigned", _payload(opportunity))
    return lead


def _update_deal(opportunity: Opportunity, data: dict, by) -> None:
    """Follow-up and proposed amount edits on one deal (the AMOUNT_CHANGE is logged)."""
    if "next_followup_at" in data:
        validate_followup(opportunity.status, data["next_followup_at"])
    if "proposed_amount" in data and data["proposed_amount"] != opportunity.proposed_amount:
        old = opportunity.proposed_amount
        new = data["proposed_amount"]
        _log(
            opportunity,
            InteractionType.AMOUNT_CHANGE,
            by,
            meta={
                "from": None if old is None else f"{old:.2f}",
                "to": None if new is None else f"{new:.2f}",
            },
        )
    for field, value in data.items():
        setattr(opportunity, field, value)
    opportunity.save()


@transaction.atomic
def update_lead(lead: Lead, data: dict, by) -> Lead:
    """Contact fields go to the lead; follow-up and proposed amount to its current deal."""
    lead = Lead.objects.select_for_update().get(pk=lead.pk)
    _require_own_or_manager(lead, by)
    deal = {f: data.pop(f) for f in DEAL_FIELDS if f in data}
    if deal:
        opportunity = current_opportunity(lead) or add_opportunity(lead, by=by)
        _update_deal(_lock_deal(opportunity), deal, by)
    for field, value in data.items():
        setattr(lead, field, value)
    lead.save()
    return lead


@transaction.atomic
def update_opportunity(opportunity: Opportunity, data: dict, by) -> Opportunity:
    opportunity = _lock_deal(opportunity)
    _require_own_or_manager(opportunity.lead, by)
    _update_deal(opportunity, data, by)
    return opportunity


# ---- Status machine ----------


@transaction.atomic
def change_status(
    opportunity: Opportunity,
    new_status: str,
    by,
    *,
    note: str = "",
    lost_reason: str = "",
    lost_note: str = "",
    proposed_amount: Decimal | None = None,
    next_followup_at: datetime | None = None,
) -> Opportunity:
    deal = _lock_deal(opportunity)
    _require_own_or_manager(deal.lead, by)
    if deal.status == new_status and new_status in CLOSED_STATUSES:
        return deal  # double click on Won / Lost: nothing happens twice
    allowed = allowed_transitions(deal, by)
    if new_status not in allowed:
        raise InvalidTransition(allowed=allowed, **{"from": deal.status, "to": new_status})

    old_status = deal.status
    meta: dict = {}
    if new_status == LeadStatus.WON:
        amount = proposed_amount if proposed_amount is not None else deal.proposed_amount
        if amount is None or amount <= 0:
            raise ValidationError(
                {"proposed_amount": ["Enter the proposed value to mark this lead won."]}
            )
        if amount != deal.proposed_amount:
            meta["amount"] = f"{amount:.2f}"
        deal.proposed_amount = amount
        deal.won_at = timezone.now()
        deal.next_followup_at = None
    elif new_status == LeadStatus.LOST:
        if not lost_reason:
            raise ValidationError({"lost_reason": ["Choose why this lead was lost."]})
        if old_status == LeadStatus.WON:
            if integrations.payments_received(deal):
                raise HasPayments()
            deal.won_at = None
            integrations.cancel_ledger(deal)
        deal.lost_reason = lost_reason
        deal.lost_note = lost_note
        deal.next_followup_at = None
        meta["lost_reason"] = lost_reason
    else:
        if old_status == LeadStatus.LOST:  # reopen
            deal.lost_reason = ""
            deal.lost_note = ""
        if next_followup_at is not None:
            validate_followup(new_status, next_followup_at)
            deal.next_followup_at = next_followup_at

    deal.status = new_status
    deal.save()
    _log(
        deal,
        InteractionType.STATUS_CHANGE,
        by,
        notes=note or lost_note,
        from_status=old_status,
        to_status=new_status,
        meta=meta,
    )

    if old_status == LeadStatus.WON and new_status == LeadStatus.LOST:
        payload = _payload(deal, reversed_by=_name(by))
        for admin in get_user_model().objects.filter(role=ADMIN, is_active=True):
            integrations.notify(admin, "lead_won_reversed", payload)
        _notify_managers("lead_won_reversed", payload, by)
    if new_status == LeadStatus.WON:
        integrations.create_ledger(deal)
        payload = _payload(deal, proposed_amount=f"{deal.proposed_amount:.2f}", won_by=_name(by))
        for admin in get_user_model().objects.filter(role=ADMIN, is_active=True):
            integrations.notify(admin, "lead_won", payload)
        _notify_managers("lead_won", payload, by)
    return deal


# ---- Interactions ----------


@transaction.atomic
def log_interaction(
    opportunity: Opportunity,
    by,
    *,
    type_: str,
    notes: str = "",
    next_followup_at: datetime | None = None,
    new_status: str | None = None,
    status_fields: dict | None = None,
    meta: dict | None = None,
) -> Interaction:
    if type_ not in USER_INTERACTION_TYPES:
        raise ValidationError({"type": ["This activity type is written by the system."]})
    deal = _lock_deal(opportunity)
    _require_own_or_manager(deal.lead, by)

    interaction = _log(deal, type_, by, notes=notes, meta=meta or {})
    target = new_status
    if not target and deal.status == LeadStatus.NEW and type_ in OUTBOUND_TYPES:
        target = LeadStatus.CONTACTED
    if target and target != deal.status:
        deal = change_status(deal, target, by, **(status_fields or {}))
    if next_followup_at is not None:
        validate_followup(deal.status, next_followup_at)
        deal.next_followup_at = next_followup_at
        deal.save(update_fields=["next_followup_at", "updated_at"])
    return interaction


# ---- Assignment ----------


def _assign_one(lead: Lead, opportunity: Opportunity | None, assignee, by) -> None:
    """Assign a deal (and, when it is the lead's current deal, the lead itself)."""
    previous = (opportunity.assigned_to if opportunity else None) or lead.assigned_to
    is_current = opportunity is None or opportunity.pk == lead.current_opportunity_id
    if is_current and lead.assigned_to_id != assignee.id:
        lead.assigned_to = assignee
        lead.save(update_fields=["assigned_to", "updated_at"])
    if opportunity is not None and opportunity.assigned_to_id != assignee.id:
        opportunity.assigned_to = assignee
        opportunity.save(update_fields=["assigned_to", "updated_at"])
    if previous and previous.id == assignee.id:
        return
    if opportunity is not None:
        _log(
            opportunity,
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
    if opportunity is not None:
        payload["opportunity_id"] = opportunity.pk
    integrations.notify(assignee, "lead_assigned", payload)
    if previous:
        integrations.notify(previous, "lead_reassigned_away", payload)


def _locked_lead(pk) -> Lead:
    return Lead.objects.select_for_update().select_related("assigned_to").get(pk=pk)


@transaction.atomic
def assign(lead: Lead, assignee_id: int, by) -> Lead:
    """Assign the lead and its current deal."""
    assignee = _check_assignee(assignee_id)
    lead = _locked_lead(lead.pk)
    deal = current_opportunity(lead)
    _assign_one(lead, _lock_deal(deal) if deal else None, assignee, by)
    return lead


@transaction.atomic
def assign_opportunity(opportunity: Opportunity, assignee_id: int, by) -> Opportunity:
    """Reassign one deal; the lead follows when it is the lead's current deal."""
    assignee = _check_assignee(assignee_id)
    lead = _locked_lead(opportunity.lead_id)
    deal = _lock_deal(opportunity)
    _assign_one(lead, deal, assignee, by)
    return deal


@transaction.atomic
def bulk_assign(leads_qs, ids: list[int], assignee_id: int, by) -> int:
    if not ids:
        raise ValidationError({"ids": ["Select at least one lead."]})
    if len(ids) > BULK_ASSIGN_LIMIT:
        raise ValidationError({"ids": [f"Assign at most {BULK_ASSIGN_LIMIT} leads at a time."]})
    assignee = _check_assignee(assignee_id)
    visible = set(leads_qs.filter(pk__in=set(ids)).values_list("pk", flat=True))
    if len(visible) != len(set(ids)):
        raise ValidationError({"ids": ["Some leads were not found."]})
    leads = list(
        Lead.objects.select_for_update().select_related("assigned_to").filter(pk__in=visible)
    )
    for lead in leads:
        deal = current_opportunity(lead)
        _assign_one(lead, _lock_deal(deal) if deal else None, assignee, by)
    return len(leads)


# ---- WhatsApp ----------


def render_text(body: str, opportunity: Opportunity, by) -> str:
    lead = opportunity.lead
    exec_name = _name(opportunity.assigned_to or lead.assigned_to) or _name(by) or ""
    return (
        body.replace("{{lead_name}}", lead.name)
        .replace("{{exec_name}}", exec_name)
        .replace("{{company}}", COMPANY_NAME)
    )


def render_template(template: WhatsAppTemplate, opportunity: Opportunity, by) -> str:
    return render_text(template.body, opportunity, by)


def whatsapp_preview(
    opportunity: Opportunity, template: WhatsAppTemplate, by, text: str | None = None
) -> dict:
    """Render only; nothing is logged. `text` is the sender's own last-minute wording, if any."""
    _require_own_or_manager(opportunity.lead, by)
    digits = phone_digits(opportunity.lead.phone)
    if not 8 <= len(digits) <= 15:
        raise PhoneUnusable()
    text = (text or "").strip() or render_template(template, opportunity, by)
    return {"text": text, "url": integrations.whatsapp_provider.open_url(digits, text)}


@transaction.atomic
def whatsapp(
    opportunity: Opportunity, template: WhatsAppTemplate, by, text: str | None = None
) -> dict:
    result = whatsapp_preview(opportunity, template, by, text)
    text = result["text"]
    MessageLog.objects.create(
        opportunity=opportunity, template=template, rendered_text=text, created_by=by
    )
    log_interaction(
        opportunity, by, type_=InteractionType.WHATSAPP, notes=f"Sent “{template.name}”"
    )
    return result


# ---- Email ----------


def email_preview(
    opportunity: Opportunity, template: EmailTemplate, by, text: str | None = None
) -> dict:
    """Render only; nothing is logged. `text` is the sender's own last-minute wording, if any."""
    lead = opportunity.lead
    _require_own_or_manager(lead, by)
    if not lead.email:
        raise EmailUnusable()
    subject = render_text(template.subject, opportunity, by)
    text = (text or "").strip() or render_text(template.body, opportunity, by)
    return {"subject": subject, "text": text}


def _flush_mail_in_background() -> None:
    """Deliver the queue right after the request, without making the user wait for SMTP."""

    def run():
        try:
            integrations.email_provider.flush()
            sync_email_statuses()
        except Exception:  # noqa: BLE001 - the queue keeps the email; `runmailer` retries it
            logger.exception("Could not deliver the queued emails")
        finally:
            connection.close()

    threading.Thread(target=run, name="mailer-flush", daemon=True).start()


def sync_email_statuses() -> None:
    """Turn Queued emails into Sent / Failed once django-mailer has tried them."""
    pending = MessageLog.objects.filter(
        channel=MessageLog.Channel.EMAIL,
        status__in=[MessageLog.Status.QUEUED, MessageLog.Status.FAILED],
    ).exclude(mail_ref="")
    by_ref = {m.mail_ref: m for m in pending}
    if not by_ref:
        return
    for ref, result in integrations.email_provider.delivery(list(by_ref)).items():
        wanted = MessageLog.Status.SENT if result == "sent" else MessageLog.Status.FAILED
        if by_ref[ref].status != wanted:
            MessageLog.objects.filter(pk=by_ref[ref].pk).update(status=wanted)


def email(opportunity: Opportunity, template: EmailTemplate, by, text: str | None = None) -> dict:
    """Queue the email for the lead in django-mailer, log it, and start delivering it."""
    result = email_preview(opportunity, template, by, text)
    try:
        ref = integrations.email_provider.queue(
            opportunity.lead.email, result["subject"], result["text"], reply_to=by.email or None
        )
    except Exception:  # noqa: BLE001 - never leak mail-system details to the client
        logger.exception("Could not queue the email for lead %s", opportunity.lead_id)
        raise EmailSendFailed() from None
    with transaction.atomic():
        MessageLog.objects.create(
            opportunity=opportunity,
            email_template=template,
            channel=MessageLog.Channel.EMAIL,
            subject=result["subject"],
            rendered_text=result["text"],
            created_by=by,
            status=MessageLog.Status.QUEUED,
            mail_ref=ref,
        )
        log_interaction(
            opportunity, by, type_=InteractionType.EMAIL, notes=f"Emailed “{template.name}”"
        )
        transaction.on_commit(_flush_mail_in_background)
    return {**result, "queued": True}


# ---- Call ----------


@transaction.atomic
def log_call(
    opportunity: Opportunity, by, *, script: CallScript | None, notes: str = ""
) -> Interaction:
    meta = {"script_id": script.id, "script_name": script.name} if script else {}
    final_notes = notes or (f"Used script “{script.name}”" if script else "")
    return log_interaction(
        opportunity, by, type_=InteractionType.CALL, notes=final_notes, meta=meta
    )


# ---- Admin ----------


@transaction.atomic
def finalize(opportunity: Opportunity, amount: Decimal, by, note: str = ""):
    if not can_finalize(by):
        raise PermissionDenied()
    if opportunity.status != LeadStatus.WON:
        raise NotWon()
    ledger = integrations.finalize(opportunity, amount, by, note)
    # Who confirmed the price goes on the timeline; the amount never does (execs see this feed).
    _log(opportunity, InteractionType.FINALIZED, by, meta={"by_name": _name(by)})
    return ledger


@transaction.atomic
def soft_delete(lead: Lead, by) -> None:
    if by.role != ADMIN:
        raise PermissionDenied()
    if integrations.lead_has_ledger(lead):
        raise HasLedger()
    lead.delete()
    Opportunity.objects.filter(lead=lead).update(is_deleted=True, deleted_at=timezone.now())
