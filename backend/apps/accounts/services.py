"""Accounts business logic (Dev C)."""
import logging

logger = logging.getLogger(__name__)


def create_ledger(lead):
    """Create the accounts.Ledger for a lead that has just been marked Won.

    Contract
    --------
    * Caller: `leads.services` (Dev A), inside the same DB transaction that flips
      the lead's status to WON. Never called from views directly.
    * Input: a `leads.Lead` instance whose status is already WON.
    * Effect: creates exactly ONE Ledger for the lead and stores the
      Total Project Amount there. That is the only place the total lives
      (see docs/ARCHITECTURE.md, "Privacy shield").
    * Idempotent: if a Ledger already exists for the lead, return it unchanged.
    * Returns: the `accounts.Ledger` instance.
    * Money: DecimalField(max_digits=12, decimal_places=2), never floats.

    STUB: the Ledger model does not exist yet, so this only logs and returns None.
    TODO(Dev C): implement once accounts.Ledger exists.
    """
    logger.warning(
        "create_ledger stub called for lead=%s; no ledger created", getattr(lead, "pk", lead)
    )
    return None
