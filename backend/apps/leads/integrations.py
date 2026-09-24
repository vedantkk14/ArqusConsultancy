"""Adapters to other apps. Leads never imports another app's models directly.

Contract expected from accounts (Dev C), see docs/API_CONTRACT.md "Leads -> Accounts":
* accounts.services.create_ledger(lead) -> Ledger   (exists as a stub; idempotent)
* accounts.services.finalize_ledger(lead, amount, by) -> Ledger   (missing: finalize returns 409)
* accounts.Ledger with `lead` (one-to-one), `total_amount` and a `finalized_at` marker (missing)
"""

from urllib.parse import quote

from django.apps import apps
from django.core.exceptions import FieldError
from django.db.models import BooleanField as _Bool
from django.db.models import Exists, OuterRef, Value

from apps.core.services import notify as _notify

from .exceptions import AccountsNotReady


def _ledger_model():
    try:
        model = apps.get_model("accounts", "Ledger")
    except LookupError:
        return None
    fields = {f.name for f in model._meta.get_fields()}
    return model if {"lead", "total_amount", "finalized_at"} <= fields else None


def accounts_missing() -> list[str]:
    """What Dev C still has to add before finalizing works (empty when ready)."""
    from apps.accounts import services

    missing = []
    if _ledger_model() is None:
        missing.append("accounts.Ledger with lead (1:1), total_amount and finalized_at")
    if not callable(getattr(services, "finalize_ledger", None)):
        missing.append("accounts.services.finalize_ledger(lead, amount, by)")
    return missing


def create_ledger(lead):
    from apps.accounts import services

    return services.create_ledger(lead)


def finalize(lead, amount, by):
    missing = accounts_missing()
    if missing:
        raise AccountsNotReady(missing=missing)
    from apps.accounts import services

    return services.finalize_ledger(lead, amount, by)


def finalized_exists():
    """Exists() expression: the lead's ledger is finalized. Always False until the marker exists."""
    model = _ledger_model()
    if model is None:
        return Value(False, output_field=_Bool())
    return Exists(model.objects.filter(lead=OuterRef("pk"), finalized_at__isnull=False))


def has_ledger(lead) -> bool:
    try:
        model = apps.get_model("accounts", "Ledger")
    except LookupError:
        return False
    return model.objects.filter(lead=lead).exists()


def payments_received(lead) -> bool:
    """True once any payment exists against the lead's ledger (the deal is then final)."""
    try:
        payment = apps.get_model("accounts", "Payment")
        return payment.objects.filter(ledger__lead=lead).exists()
    except (LookupError, FieldError):
        return False


def cancel_ledger(lead) -> None:
    """Ask accounts to cancel the ledger created when the lead was won (no-op until it exists)."""
    from apps.accounts import services

    handler = getattr(services, "cancel_ledger", None)
    if callable(handler):
        handler(lead)


def finance_for(lead) -> dict:
    """{finalized, total_amount, finalized_at} for roles allowed to see the final amount."""
    model = _ledger_model()
    ledger = model.objects.filter(lead=lead).first() if model else None
    if ledger is None or ledger.finalized_at is None:
        return {"finalized": False, "total_amount": None, "finalized_at": None}
    return {
        "finalized": True,
        "total_amount": f"{ledger.total_amount:.2f}",
        "finalized_at": ledger.finalized_at.isoformat(),
    }


def notify(user, type_, payload):
    _notify(user, type_, payload)


# ---- WhatsApp ----------


class WhatsAppProvider:
    """Turns a rendered message into something the user can act on. Swap for the Meta API later."""

    def open_url(self, phone_digits: str, text: str) -> str:
        raise NotImplementedError


class WaMeProvider(WhatsAppProvider):
    def open_url(self, phone_digits: str, text: str) -> str:
        return f"https://wa.me/{phone_digits}?text={quote(text, safe='')}"


whatsapp_provider: WhatsAppProvider = WaMeProvider()
