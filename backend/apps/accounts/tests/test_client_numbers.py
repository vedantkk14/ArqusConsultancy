"""A client with several won deals: each ledger is numbered #1, #2, ... (oldest first), newest
listed first, and the statement names the same number."""

from django.utils import timezone

from apps.leads.models import LeadStatus
from apps.leads.services import add_opportunity

from .conftest import LEDGERS


def test_ledgers_of_a_returning_client_are_numbered(
    client_for, admin, make_ledger, make_opportunity
):
    first = make_ledger(total="50000.00")
    second_deal = add_opportunity(
        first.opportunity.lead,
        status=LeadStatus.WON,
        won_at=timezone.now(),
        proposed_amount="80000.00",
    )
    second = make_ledger(total="80000.00", opportunity=second_deal)
    solo = make_ledger(total="10000.00")

    rows = client_for(admin).get(LEDGERS).json()["results"]
    by_id = {r["id"]: r for r in rows}
    assert by_id[first.pk]["client_no"] == 1
    assert by_id[second.pk]["client_no"] == 2
    assert by_id[solo.pk]["client_no"] is None  # one deal: no number
    assert [r["id"] for r in rows] == [solo.pk, second.pk, first.pk]  # most recent first

    statement = client_for(admin).get(f"{LEDGERS}/{second.pk}/statement").json()
    assert statement["client"]["no"] == 2
