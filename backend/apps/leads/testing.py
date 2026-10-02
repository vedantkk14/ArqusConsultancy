"""Test helper for other apps: build a client (Lead) with one deal (Opportunity) in one call."""

from .models import Lead, Opportunity
from .services import add_opportunity

#: Arguments that belong to the client record; everything else goes to the deal.
LEAD_FIELDS = {"name", "phone", "email", "source", "source_other", "requirements", "assigned_to"}


def make_deal(**fields) -> Opportunity:
    """A new lead and its Deal #1. `created_by` is set on both."""
    by = fields.pop("created_by", None)
    lead = Lead.objects.create(
        created_by=by, **{k: fields.pop(k) for k in list(fields) if k in LEAD_FIELDS}
    )
    return add_opportunity(lead, by=by, **fields)
