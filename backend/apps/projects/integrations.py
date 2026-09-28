"""Adapters to other apps. Projects never imports another app's models directly.

Contract expected from accounts (Dev C), see docs/API_CONTRACT.md "Projects -> Accounts":
* accounts.services.get_project_finance(opportunity)
  -> {total_amount, received, outstanding, finalized} | None   (Decimals; None = no ledger)
  Its existence is also the "finalization marker": once it exists, a deal must be finalized
  before it can be converted.

A project is converted from one leads.Opportunity (a won deal); `opportunity.lead` is the client.
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
    return [] if accounts_ready() else ["accounts.services.get_project_finance(opportunity)"]


def _dec(value) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def finance_for(opportunity) -> dict | None:
    """Ledger figures for the deal, or None when accounts cannot say (no function, no ledger)."""
    fn = _accounts_fn()
    if fn is None or opportunity is None:
        return None
    raw = fn(opportunity)
    if not raw:
        return None
    return {
        "ledger_id": raw.get("ledger_id"),
        "total_amount": _dec(raw.get("total_amount")),
        "received": _dec(raw.get("received")),
        "outstanding": _dec(raw.get("outstanding")),
        "finalized": bool(raw.get("finalized")),
    }


def deal_total(opportunity) -> Decimal | None:
    """The deal total: the ledger total, or the deal's proposed amount until accounts exist."""
    if opportunity is None:
        return None
    finance = finance_for(opportunity)
    if finance and finance["total_amount"] is not None:
        return finance["total_amount"]
    return None if accounts_ready() else opportunity.proposed_amount


def finalization_problem(opportunity) -> str | None:
    """None when the deal may be converted. Only enforced once the accounts marker exists."""
    if not accounts_ready():
        return None
    finance = finance_for(opportunity)
    return None if finance and finance["finalized"] else "not_finalized"


def notify(user, type_, payload):
    _notify(user, type_, payload)


def lead_model():
    from django.apps import apps

    return apps.get_model("leads", "Lead")


def opportunity_model():
    from django.apps import apps

    return apps.get_model("leads", "Opportunity")


def add_opportunity(lead, **fields):
    """Create a lead's next deal through the leads app (demo data only)."""
    from apps.leads.services import add_opportunity as _add

    return _add(lead, **fields)


def lock_opportunity(opportunity_id):
    """The deal row with its lead, locked for the rest of the transaction (None if missing or
    soft-deleted)."""
    return (
        opportunity_model()
        .objects.select_for_update()
        .select_related("lead")
        .filter(pk=opportunity_id, lead__is_deleted=False)
        .first()
    )
