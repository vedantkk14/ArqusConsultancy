# ruff: noqa: E501
"""Accounts business logic. Every write is transactional.

Adapter functions called by other apps (do not rename or change their signatures):
* create_ledger(lead) -> Ledger                      (leads, on Won, inside its transaction; idempotent)
* finalize_ledger(lead, amount, by) -> Ledger        (leads, admin finalizes the deal amount)
* get_project_finance(lead) -> dict | None           (projects: total, received, outstanding, finalized)
* cancel_ledger(lead) -> None                        (leads, when a won deal is marked lost before payment)
"""

import logging
import re
from datetime import timedelta
from decimal import Decimal
from urllib.parse import quote

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.services import notify

from . import proofs, rules, selectors
from .exceptions import (
    AlreadyFinalized,
    DuplicatePayment,
    InvalidPhone,
    NotFinalized,
    Overpayment,
    PaymentVoid,
    TotalBelowBudget,
    TotalBelowReceived,
)
from .models import Ledger, LedgerEvent, LedgerEventType, Payment, PaymentMode
from .utils import csv_safe, format_inr, receipt_number

logger = logging.getLogger(__name__)


def _name(user) -> str | None:
    return user.display_name if user else None


def _event(ledger, type_, actor, **data) -> LedgerEvent:
    return LedgerEvent.objects.create(ledger=ledger, type=type_, actor=actor, data=data)


def _require_admin(user) -> None:
    if user is None or user.role not in rules.ACCOUNTS_ROLES:
        raise PermissionDenied()


def _other_admins(by):
    qs = get_user_model().objects.filter(role="ADMIN", is_active=True)
    return qs.exclude(pk=by.pk) if by is not None else qs


def _check_amount(amount, field="amount") -> Decimal:
    """A positive amount with at most 10 whole digits and 2 decimals."""
    try:
        value = Decimal(str(amount))
    except Exception as exc:  # noqa: BLE001 - any malformed input is a field error
        raise ValidationError({field: ["Enter a valid amount."]}) from exc
    if not value.is_finite() or value <= 0:
        raise ValidationError({field: ["Enter an amount above zero."]})
    if value != value.quantize(Decimal("0.01")):
        raise ValidationError({field: ["Use at most 2 decimals."]})
    if len(str(int(value))) > rules.MAX_AMOUNT_DIGITS:
        raise ValidationError({field: ["That amount is too large."]})
    return value.quantize(Decimal("0.01"))


def _locked(ledger_id) -> Ledger:
    return (
        Ledger.objects.select_for_update()
        .select_related("lead", "lead__assigned_to")
        .get(pk=ledger_id)
    )


def project_for(lead):
    """The linked project (read only), or None. Projects is another app: read it through the registry."""
    try:
        model = apps.get_model("projects", "Project")
    except LookupError:
        return None
    return model.objects.filter(lead=lead).first()


# ---- Adapters (called by leads and projects) ----------


def create_ledger(lead) -> Ledger:
    """Create the ledger for a lead that has just been marked Won. Idempotent (get_or_create)."""
    ledger, created = Ledger.objects.get_or_create(
        lead=lead, defaults={"total_amount": lead.proposed_amount or Decimal("0.00")}
    )
    if created:
        _event(
            ledger, LedgerEventType.CREATED, None, proposed=selectors.money_str(ledger.total_amount)
        )
    return ledger


@transaction.atomic
def finalize_ledger(lead, amount, by, note: str = "") -> Ledger:
    """Admin confirms the final Total Amount. Finalizing twice is a 409 `already_finalized`."""
    _require_admin(by)
    create_ledger(lead)
    ledger = _locked(Ledger.objects.get(lead=lead).pk)
    if ledger.finalized_at:
        raise AlreadyFinalized()
    amount = _check_amount(amount)
    moment = selectors.now()
    ledger.total_amount = amount
    ledger.finalized_at = moment
    ledger.finalized_on = selectors.business_date(moment)
    ledger.finalized_by = by
    ledger.finalize_note = (note or "")[: rules.NOTE_MAX]
    ledger.save()
    _event(
        ledger,
        LedgerEventType.FINALIZED,
        by,
        amount=selectors.money_str(amount),
        note=ledger.finalize_note,
    )
    if ledger.lead.assigned_to:  # the exec is told the deal is final, never the amount
        notify(
            ledger.lead.assigned_to, "deal_finalized", {"lead_id": lead.pk, "lead_name": lead.name}
        )
    return ledger


def get_project_finance(lead) -> dict | None:
    """{total_amount, received, outstanding, finalized} for the lead's ledger, or None without one."""
    ledger = Ledger.objects.filter(lead=lead).first()
    if ledger is None:
        return None
    received = selectors.received_for(ledger)
    return {
        "total_amount": ledger.total_amount,
        "received": received,
        "outstanding": ledger.total_amount - received,
        "finalized": ledger.finalized_at is not None,
    }


def cancel_ledger(lead) -> None:
    """A won deal went back to Lost before any payment: the ledger goes with it (leads checks payments first)."""
    ledger = Ledger.objects.filter(lead=lead).first()
    if ledger is not None and not ledger.payments.exists():
        ledger.delete()


# ---- Ledger writes ----------


@transaction.atomic
def finalize(ledger_id, amount, by, note: str = "") -> Ledger:
    return finalize_ledger(Ledger.objects.get(pk=ledger_id).lead, amount, by, note)


@transaction.atomic
def revise_total(ledger_id, amount, reason: str, by) -> Ledger:
    _require_admin(by)
    ledger = _locked(ledger_id)
    if not ledger.finalized_at:
        raise NotFinalized("Finalize the deal amount first.")
    amount = _check_amount(amount)
    received = selectors.received_for(ledger)
    if amount < received:
        raise TotalBelowReceived(
            f"The total cannot be lower than the {format_inr(received)} already received.",
            received=selectors.money_str(received),
        )
    project = project_for(ledger.lead)
    if project is not None and amount < project.sanctioned_budget:
        raise TotalBelowBudget(
            f"The total cannot be lower than the project's sanctioned budget of {format_inr(project.sanctioned_budget)}.",
            min_total=selectors.money_str(project.sanctioned_budget),
        )
    old = ledger.total_amount
    ledger.total_amount = amount
    ledger.save(update_fields=["total_amount", "updated_at"])
    _event(
        ledger,
        LedgerEventType.TOTAL_REVISED,
        by,
        old=selectors.money_str(old),
        new=selectors.money_str(amount),
        reason=reason,
    )
    return ledger


# ---- Payments ----------


def _proof_file(payment, proof: proofs.Proof) -> None:
    payment.proof.save(f"proof.{proof.ext}", ContentFile(proof.data), save=False)
    payment.proof_kind = proof.kind
    payment.proof_type = proof.content_type


def _discard(name: str | None) -> None:
    if name:
        Payment._meta.get_field("proof").storage.delete(name)


def _check_payment_fields(data: dict) -> None:
    if data["mode"] != PaymentMode.CASH and not (data.get("reference") or "").strip():
        raise ValidationError({"reference": ["Enter the reference for this payment."]})
    today = selectors.business_today()
    received_on = data["received_on"]
    if received_on > today:
        raise ValidationError({"received_on": ["The date cannot be in the future."]})
    if received_on < today - timedelta(days=rules.PAYMENT_BACKDATE_DAYS):
        raise ValidationError(
            {
                "received_on": [
                    f"The date cannot be more than {rules.PAYMENT_BACKDATE_DAYS} days ago."
                ]
            }
        )


def add_payment(ledger_id, by, data: dict, upload=None) -> Payment:
    _require_admin(by)
    data = {**data, "amount": _check_amount(data.get("amount"))}
    _check_payment_fields(data)
    proof = proofs.process(upload) if upload is not None else None
    stored = None
    try:
        with transaction.atomic():
            ledger = _locked(ledger_id)
            if rules.PAYMENT_REQUIRES_FINALIZED and not ledger.finalized_at:
                raise NotFinalized()
            received = selectors.received_for(ledger)
            amount = data["amount"]
            if rules.BLOCK_OVERPAYMENT and received + amount > ledger.total_amount:
                left = max(ledger.total_amount - received, Decimal("0"))
                raise Overpayment(
                    f"This is more than the outstanding balance of {format_inr(left)}.",
                    outstanding=selectors.money_str(left),
                )
            if not data.get("confirm_duplicate"):
                since = timezone.now() - timedelta(seconds=rules.DUPLICATE_WINDOW_SECONDS)
                if active_dupes(ledger, data, since):
                    raise DuplicatePayment()
            payment = Payment(
                ledger=ledger,
                amount=amount,
                mode=data["mode"],
                reference=(data.get("reference") or "").strip(),
                received_on=data["received_on"],
                note=(data.get("note") or "")[: rules.NOTE_MAX],
                recorded_by=by,
            )
            if proof:
                _proof_file(payment, proof)
                stored = payment.proof.name
            payment.save()
            ledger.overdue_notified_at = None
            ledger.save(update_fields=["overdue_notified_at", "updated_at"])
            _event(
                ledger,
                LedgerEventType.PAYMENT_ADDED,
                by,
                payment_id=payment.pk,
                receipt_no=receipt_number(payment),
                amount=selectors.money_str(amount),
                mode=payment.mode,
            )
            payload = {
                "ledger_id": ledger.pk,
                "lead_name": ledger.lead.name,
                "amount": selectors.money_str(amount),
            }
            for admin in _other_admins(by):
                notify(admin, "payment_received", payload)
            return payment
    except Exception:
        _discard(stored)
        raise


def active_dupes(ledger, data, since) -> bool:
    return Payment.objects.filter(
        ledger=ledger,
        amount=data["amount"],
        mode=data["mode"],
        reference=(data.get("reference") or "").strip(),
        received_on=data["received_on"],
        is_void=False,
        created_at__gte=since,
    ).exists()


@transaction.atomic
def void_payment(payment_id, by, reason: str) -> Payment:
    _require_admin(by)
    payment = Payment.objects.get(pk=payment_id)
    ledger = _locked(payment.ledger_id)
    payment = Payment.objects.select_for_update().get(pk=payment_id)
    if payment.is_void:
        raise PaymentVoid()
    payment.is_void = True
    payment.void_reason = reason
    payment.voided_at = timezone.now()
    payment.voided_by = by
    payment.save(update_fields=["is_void", "void_reason", "voided_at", "voided_by", "updated_at"])
    _event(
        ledger,
        LedgerEventType.PAYMENT_VOIDED,
        by,
        payment_id=payment.pk,
        receipt_no=receipt_number(payment),
        amount=selectors.money_str(payment.amount),
        reason=reason,
    )
    payload = {
        "ledger_id": ledger.pk,
        "lead_name": ledger.lead.name,
        "amount": selectors.money_str(payment.amount),
    }
    for admin in _other_admins(by):
        notify(admin, "payment_voided", payload)
    return payment


# ---- Reminder ----------


def _phone_digits(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if not 8 <= len(digits) <= 15:
        raise InvalidPhone()
    return digits


@transaction.atomic
def send_reminder(ledger_id, by) -> dict:
    """Render a payment reminder and return {text, url}; the admin sends it from WhatsApp."""
    _require_admin(by)
    ledger = _locked(ledger_id)
    received = selectors.received_for(ledger)
    outstanding = ledger.total_amount - received
    if not ledger.finalized_at or outstanding <= 0:
        raise ValidationError(
            {"non_field_errors": ["There is nothing outstanding on this ledger."]}
        )
    digits = _phone_digits(ledger.lead.phone)
    text = (
        f"Hello {ledger.lead.name}, this is a gentle reminder from {rules.COMPANY_NAME}. "
        f"{format_inr(outstanding)} is pending against your project "
        f"({format_inr(ledger.total_amount)} agreed, {format_inr(received)} received). "
        "Please arrange the payment at your earliest convenience. Thank you."
    )
    _event(ledger, LedgerEventType.REMINDER_SENT, by, outstanding=selectors.money_str(outstanding))
    return {"text": text, "url": f"https://wa.me/{digits}?text={quote(text, safe='')}"}


# ---- Statement ----------


def build_statement(ledger, date_from=None, date_to=None) -> dict:
    """Customer statement: deal total, credits and running balance. Never any budget, expense or margin."""
    payments = list(
        selectors.active_payments()
        .filter(ledger=ledger)
        .select_related("recorded_by")
        .order_by("received_on", "id")
    )
    opening_credits = sum(
        (p.amount for p in payments if date_from and p.received_on < date_from), Decimal("0")
    )
    rows_src = [
        p
        for p in payments
        if (not date_from or p.received_on >= date_from)
        and (not date_to or p.received_on <= date_to)
    ]
    balance = ledger.total_amount - opening_credits
    rows, credit_total = [], Decimal("0")
    for p in rows_src:
        balance -= p.amount
        credit_total += p.amount
        rows.append(
            {
                "date": p.received_on.isoformat(),
                "receipt_no": receipt_number(p),
                "particulars": " ".join(x for x in (p.get_mode_display(), p.reference) if x),
                "credit": selectors.money_str(p.amount),
                "balance": selectors.money_str(balance),
            }
        )
    return {
        "client": {
            "name": ledger.lead.name,
            "phone": ledger.lead.phone,
            "email": ledger.lead.email,
        },
        "ledger": ledger.pk,
        "finalized": ledger.finalized_at is not None,
        "period": {
            "from": date_from.isoformat() if date_from else None,
            "to": date_to.isoformat() if date_to else None,
        },
        "total_amount": selectors.money_str(ledger.total_amount),
        "opening_balance": selectors.money_str(ledger.total_amount - opening_credits),
        "rows": rows,
        "credit_total": selectors.money_str(credit_total),
        "closing_balance": selectors.money_str(balance),
        "generated_on": selectors.business_today().isoformat(),
    }


def statement_csv_rows(statement: dict) -> list[list[str]]:
    rows = [["Date", "Receipt", "Particulars", "Credit", "Balance"]]
    rows.append(["", "", "Deal total", "", statement["total_amount"]])
    rows += [
        [
            csv_safe(v)
            for v in (r["date"], r["receipt_no"], r["particulars"], r["credit"], r["balance"])
        ]
        for r in statement["rows"]
    ]
    rows.append(
        [
            "",
            "",
            "Total received in period",
            statement["credit_total"],
            statement["closing_balance"],
        ]
    )
    return rows
