# ruff: noqa: E501
"""Output is built by plain functions (fast, no N+1); input by DRF serializers. Admin only, everywhere."""

import re
from datetime import timedelta
from decimal import ROUND_DOWN, Decimal

from django.apps import apps
from rest_framework import serializers

from . import rules, selectors
from .models import LedgerState, PaymentMode
from .utils import receipt_number, to_indian_words


class MoneyField(serializers.Field):
    """A positive amount from a string (or int), up to 10 digits and 2 decimals. No floats."""

    default_error_messages = {
        "invalid": "Enter an amount above zero, with up to 10 digits and 2 decimals."
    }

    def to_internal_value(self, data):
        if isinstance(data, bool) or isinstance(data, float):
            self.fail("invalid")
        if isinstance(data, int):
            data = str(data)
        if not isinstance(data, str):
            self.fail("invalid")
        text = data.strip()
        if not re.fullmatch(rf"\d{{1,{rules.MAX_AMOUNT_DIGITS}}}(\.\d{{1,2}})?", text):
            self.fail("invalid")
        value = Decimal(text)
        if value <= 0:
            self.fail("invalid")
        return value.quantize(Decimal("0.01"))

    def to_representation(self, value):
        return selectors.money_str(value)


def pct_str(part, whole) -> str:
    whole = Decimal(whole or 0)
    if whole <= 0:
        return "0.0"
    return f"{(Decimal(part or 0) * 100 / whole).quantize(Decimal('0.1'), rounding=ROUND_DOWN):.1f}"


def _user(user) -> dict | None:
    return {"id": user.pk, "name": user.display_name} if user else None


# ---- Ledgers ----------


def ledger_row(ledger, today=None) -> dict:
    """One ledger from a with_figures() queryset (needs lead and lead.assigned_to selected)."""
    today = today or selectors.business_today()
    finalized = ledger.finalized_at is not None
    state = selectors.ledger_state(ledger.total_amount, ledger.received, finalized)
    return {
        "id": ledger.pk,
        "lead": ledger.lead_id,
        "client": ledger.lead.name,
        "phone": ledger.lead.phone,
        "exec_name": ledger.lead.assigned_to.display_name if ledger.lead.assigned_to else None,
        "state": state,
        "state_label": LedgerState(state).label,
        "finalized": finalized,
        "is_overdue": selectors.is_overdue(finalized, ledger.outstanding, ledger.aging_base, today),
        "total": selectors.money_str(ledger.total_amount),
        "received": selectors.money_str(ledger.received),
        "outstanding": selectors.money_str(ledger.outstanding)
        if finalized
        else selectors.money_str(ledger.total_amount),
        "collected_pct": pct_str(ledger.received, ledger.total_amount) if finalized else "0.0",
        "days_since": selectors.days_since(ledger.aging_base, today) if finalized else None,
        "last_payment_on": ledger.last_payment_on.isoformat() if ledger.last_payment_on else None,
        "created_at": ledger.created_at.isoformat(),
    }


def allowed_actions(ledger) -> list[str]:
    if ledger.finalized_at is None:
        return ["finalize"]
    actions = ["revise_total", "statement"]
    if ledger.outstanding > 0:
        actions = ["record_payment", "reminder"] + actions
    return actions


def project_block(ledger) -> dict | None:
    """Read-only view of the linked project, from the real projects budget functions."""
    try:
        model = apps.get_model("projects", "Project")
        from apps.projects import selectors as project_selectors
    except (LookupError, ImportError):
        return None
    project = project_selectors.budget_usage_qs(
        model.objects.filter(lead_id=ledger.lead_id)
    ).first()
    if project is None:
        return None
    margins = project_selectors.project_margins(
        {"total_amount": ledger.total_amount, "received": ledger.received},
        project.spent,
        project.sanctioned_budget,
    )
    return {
        "id": project.pk,
        "name": project.name,
        "status": project.status,
        "sanctioned_budget": selectors.money_str(project.sanctioned_budget),
        "spent": selectors.money_str(project.spent),
        **margins,
    }


def ledger_detail(ledger) -> dict:
    row = ledger_row(ledger)
    lead = ledger.lead
    return {
        **row,
        "lead_block": {
            "id": lead.pk,
            "name": lead.name,
            "phone": lead.phone,
            "email": lead.email,
            "exec_name": row["exec_name"],
            "status": lead.status,
        },
        "project": project_block(ledger),
        "finalized_at": ledger.finalized_at.isoformat() if ledger.finalized_at else None,
        "finalized_by": _user(ledger.finalized_by),
        "finalize_note": ledger.finalize_note,
        "proposed_amount": selectors.money_str(lead.proposed_amount)
        if lead.proposed_amount is not None
        else None,
        "allowed_actions": allowed_actions(ledger),
    }


def event_row(event) -> dict:
    return {
        "id": event.pk,
        "type": event.type,
        "actor_name": event.actor.display_name if event.actor else None,
        "data": event.data,
        "created_at": event.created_at.isoformat(),
    }


# ---- Payments ----------


def payment_row(payment, with_balance=False) -> dict:
    row = {
        "id": payment.pk,
        "ledger": payment.ledger_id,
        "client": payment.ledger.lead.name,
        "receipt_no": receipt_number(payment),
        "amount": selectors.money_str(payment.amount),
        "mode": payment.mode,
        "mode_label": PaymentMode(payment.mode).label,
        "reference": payment.reference,
        "received_on": payment.received_on.isoformat(),
        "note": payment.note,
        "has_proof": bool(payment.proof),
        "proof_kind": payment.proof_kind,
        "proof_type": payment.proof_type,
        "is_void": payment.is_void,
        "void_reason": payment.void_reason,
        "recorded_by": _user(payment.recorded_by),
        "created_at": payment.created_at.isoformat(),
    }
    if with_balance:
        balance = selectors.balance_after(payment)
        row["balance_after"] = None if balance is None else selectors.money_str(balance)
        row["amount_in_words"] = to_indian_words(payment.amount)
        row["client_phone"] = payment.ledger.lead.phone
        row["company"] = rules.COMPANY_NAME
    return row


# ---- Input ----------


class FinalizeSerializer(serializers.Serializer):
    amount = MoneyField()
    note = serializers.CharField(required=False, allow_blank=True, max_length=rules.NOTE_MAX)


class ReviseSerializer(serializers.Serializer):
    amount = MoneyField()
    reason = serializers.CharField(max_length=300)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class PaymentWriteSerializer(serializers.Serializer):
    amount = MoneyField()
    mode = serializers.ChoiceField(choices=PaymentMode.choices)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=100)
    received_on = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True, max_length=rules.NOTE_MAX)
    proof = serializers.FileField(required=False, allow_empty_file=False)
    confirm_duplicate = serializers.BooleanField(required=False)


__all__ = ["timedelta"]
