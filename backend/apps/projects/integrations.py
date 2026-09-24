"""Adapters to other apps. Projects never imports another app's models directly.

Contract expected from accounts (Dev C), see docs/API_CONTRACT.md "Projects -> Accounts":
* accounts.services.get_project_finance(lead)
  -> {total_amount, received, outstanding, finalized} | None   (Decimals; None = no ledger)
  Its existence is also the "finalization marker": once it exists, a lead must be finalized
  before it can be converted.
"""

from decimal import Decimal

from apps.core.services import notify as _notify


def _accounts_fn():
    from apps.accounts import services

    fn = getattr(services, "get_project_finance", None)
    return fn if callable(fn) else None


def accounts_ready() -> bool:
    return _accounts_fn() is not None


def accounts_missing() -> list[str]:
    return [] if accounts_ready() else ["accounts.services.get_project_finance(lead)"]


def _dec(value) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def finance_for(lead) -> dict | None:
    """Ledger figures for `lead`, or None when accounts cannot say (no function, no ledger)."""
    fn = _accounts_fn()
    if fn is None or lead is None:
        return None
    raw = fn(lead)
    if not raw:
        return None
    return {
        "total_amount": _dec(raw.get("total_amount")),
        "received": _dec(raw.get("received")),
        "outstanding": _dec(raw.get("outstanding")),
        "finalized": bool(raw.get("finalized")),
    }


def deal_total(lead) -> Decimal | None:
    """The deal total: the ledger total, or the lead's proposed amount until accounts exist."""
    if lead is None:
        return None
    finance = finance_for(lead)
    if finance and finance["total_amount"] is not None:
        return finance["total_amount"]
    return None if accounts_ready() else lead.proposed_amount


def finalization_problem(lead) -> str | None:
    """None when the deal may be converted. Only enforced once the accounts marker exists."""
    if not accounts_ready():
        return None
    finance = finance_for(lead)
    return None if finance and finance["finalized"] else "not_finalized"


def notify(user, type_, payload):
    _notify(user, type_, payload)


def lead_model():
    from django.apps import apps

    return apps.get_model("leads", "Lead")


def lock_lead(lead_id):
    """The lead row, locked for the rest of the transaction (None if missing or soft-deleted)."""
    return lead_model().objects.select_for_update().filter(pk=lead_id).first()
