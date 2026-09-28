"""Adapters to other apps. Leads never imports another app's models directly.

Contract expected from accounts (Dev C), see docs/API_CONTRACT.md "Leads -> Accounts":
* accounts.services.create_ledger(opportunity) -> Ledger   (idempotent)
* accounts.services.finalize_ledger(opportunity, amount, by, note) -> Ledger
* accounts.Ledger with `opportunity` (one-to-one), `total_amount` and a `finalized_at` marker

Every function here takes a leads.Opportunity (one deal) unless it says otherwise.
"""

from urllib.parse import quote

from django.apps import apps
from django.core.exceptions import FieldError
from django.db.models import BooleanField as _Bool
from django.db.models import DecimalField, Exists, OuterRef, Subquery, Value

from apps.core.services import notify as _notify

from .exceptions import AccountsNotReady


def _ledger_model():
    try:
        model = apps.get_model("accounts", "Ledger")
    except LookupError:
        return None
    fields = {f.name for f in model._meta.get_fields()}
    return model if {"opportunity", "total_amount", "finalized_at"} <= fields else None


def _project_model():
    try:
        return apps.get_model("projects", "Project")
    except LookupError:
        return None


def accounts_missing() -> list[str]:
    """What Dev C still has to add before finalizing works (empty when ready)."""
    from apps.accounts import services

    missing = []
    if _ledger_model() is None:
        missing.append("accounts.Ledger with opportunity (1:1), total_amount and finalized_at")
    if not callable(getattr(services, "finalize_ledger", None)):
        missing.append("accounts.services.finalize_ledger(opportunity, amount, by)")
    return missing


def create_ledger(opportunity):
    from apps.accounts import services

    return services.create_ledger(opportunity)


def finalize(opportunity, amount, by, note: str = ""):
    missing = accounts_missing()
    if missing:
        raise AccountsNotReady(missing=missing)
    from apps.accounts import services

    return services.finalize_ledger(opportunity, amount, by, note)


def finalized_exists(ref: str = "pk"):
    """Exists() expression: the deal's ledger is finalized. Always False until the marker exists.

    `ref` names the opportunity id on the outer queryset: "pk" on an Opportunity queryset,
    "current_opportunity" on a Lead queryset (the lead's current deal).
    """
    model = _ledger_model()
    if model is None:
        return Value(False, output_field=_Bool())
    return Exists(model.objects.filter(opportunity=OuterRef(ref), finalized_at__isnull=False))


def finalized_total(ref: str = "pk"):
    """Subquery: the deal's finalized ledger total (None until finalized, or without accounts)."""
    model = _ledger_model()
    if model is None:
        return Value(None, output_field=DecimalField(max_digits=12, decimal_places=2))
    return Subquery(
        model.objects.filter(opportunity=OuterRef(ref), finalized_at__isnull=False).values(
            "total_amount"
        )[:1],
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )


def has_ledger(opportunity) -> bool:
    model = _ledger_model()
    return bool(model and model.objects.filter(opportunity=opportunity).exists())


def lead_has_ledger(lead) -> bool:
    """Any of the lead's deals has a ledger (the client record can then no longer be deleted)."""
    model = _ledger_model()
    return bool(model and model.objects.filter(opportunity__lead=lead).exists())


def payments_received(opportunity) -> bool:
    """True once any payment exists against the deal's ledger (the deal is then final)."""
    try:
        payment = apps.get_model("accounts", "Payment")
        return payment.objects.filter(ledger__opportunity=opportunity).exists()
    except (LookupError, FieldError):
        return False


def cancel_ledger(opportunity) -> None:
    """Ask accounts to cancel the ledger created when the deal was won (no-op until it exists)."""
    from apps.accounts import services

    handler = getattr(services, "cancel_ledger", None)
    if callable(handler):
        handler(opportunity)


def _finance(ledger) -> dict:
    if ledger is None or ledger.finalized_at is None:
        return {"finalized": False, "total_amount": None, "finalized_at": None}
    return {
        "finalized": True,
        "total_amount": f"{ledger.total_amount:.2f}",
        "finalized_at": ledger.finalized_at.isoformat(),
    }


def finance_for(opportunity) -> dict:
    """{finalized, total_amount, finalized_at} for roles allowed to see the final amount."""
    model = _ledger_model()
    ledger = (
        model.objects.filter(opportunity=opportunity).first() if model and opportunity else None
    )
    return _finance(ledger)


def deal_links(opportunity_ids) -> dict[int, dict]:
    """{opportunity_id: {ledger_id, project_id, project_name, project_status, project_pm_name,
    finance}} for the given deals. Two queries whatever the number of deals; the view decides which
    keys a role may see."""
    ids = [i for i in opportunity_ids if i]
    out = {
        i: {
            "ledger_id": None,
            "project_id": None,
            "project_name": None,
            "project_status": None,
            "project_pm_name": None,
            "finance": _finance(None),
        }
        for i in ids
    }
    model = _ledger_model()
    if model is not None and ids:
        for ledger in model.objects.filter(opportunity_id__in=ids):
            out[ledger.opportunity_id]["ledger_id"] = ledger.pk
            out[ledger.opportunity_id]["finance"] = _finance(ledger)
    project = _project_model()
    if project is not None and ids:
        rows = project.objects.filter(opportunity_id__in=ids).select_related("pm")
        for p in rows:
            out[p.opportunity_id]["project_id"] = p.pk
            out[p.opportunity_id]["project_name"] = p.name
            out[p.opportunity_id]["project_status"] = p.status
            out[p.opportunity_id]["project_pm_name"] = p.pm.display_name if p.pm else None
    return out


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
