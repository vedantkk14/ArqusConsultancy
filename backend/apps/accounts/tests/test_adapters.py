# ruff: noqa: E501
"""The functions Leads and Projects already call, with the exact signatures they expect."""

from decimal import Decimal

import pytest

from apps.accounts import selectors, services
from apps.accounts.models import Ledger, LedgerEvent
from apps.leads import integrations as lead_integrations
from apps.leads.models import LeadStatus, Opportunity
from apps.projects import integrations as project_integrations

from .conftest import LEDGERS


def test_create_ledger_is_idempotent_and_takes_the_proposed_amount(make_opportunity):
    lead = make_opportunity(proposed_amount=Decimal("250000.00"))
    first = services.create_ledger(lead)
    second = services.create_ledger(lead)
    assert first.pk == second.pk and Ledger.objects.count() == 1
    assert first.total_amount == Decimal("250000.00") and first.finalized_at is None
    assert LedgerEvent.objects.filter(ledger=first, type="CREATED").count() == 1


def test_create_ledger_without_a_proposed_amount(make_opportunity):
    assert services.create_ledger(make_opportunity(proposed_amount=None)).total_amount == Decimal(
        "0.00"
    )


def test_finalize_ledger_signature_and_effect(make_opportunity, admin):
    lead = make_opportunity()
    ledger = services.finalize_ledger(lead, Decimal("120000.00"), admin)
    assert ledger.total_amount == Decimal("120000.00")
    assert ledger.finalized_at and ledger.finalized_by_id == admin.pk
    assert ledger.finalized_on == selectors.business_date(ledger.finalized_at)


def test_get_project_finance_shapes(make_opportunity, make_payment, admin):
    lead = make_opportunity()
    assert services.get_project_finance(lead) is None  # no ledger
    services.create_ledger(lead)
    assert services.get_project_finance(lead) == {
        "total_amount": Decimal("100000.00"), "received": Decimal("0.00"),
        "outstanding": Decimal("100000.00"), "finalized": False,
    }  # fmt: skip
    services.finalize_ledger(lead, Decimal("90000.00"), admin)
    make_payment(Ledger.objects.get(opportunity=lead), "30000.00")
    finance = services.get_project_finance(lead)
    assert finance["total_amount"] == Decimal("90000.00") and finance["received"] == Decimal(
        "30000.00"
    )
    assert finance["outstanding"] == Decimal("60000.00") and finance["finalized"] is True
    assert all(isinstance(finance[k], Decimal) for k in ("total_amount", "received", "outstanding"))


def test_cancel_ledger_removes_an_unpaid_ledger_only(make_opportunity, make_ledger, make_payment):
    unpaid = make_ledger()
    services.cancel_ledger(unpaid.opportunity)
    assert not Ledger.objects.filter(pk=unpaid.pk).exists()
    paid = make_ledger()
    make_payment(paid, "10.00")
    services.cancel_ledger(paid.opportunity)
    assert Ledger.objects.filter(pk=paid.pk).exists()


def test_the_leads_adapter_sees_the_module_as_ready():
    assert lead_integrations.accounts_missing() == []
    assert project_integrations.accounts_missing() == []


def test_finalized_exists_marker_matches_the_ledger(make_ledger, make_opportunity):
    finalized = make_ledger()
    open_ledger = make_ledger(finalize=False)
    flags = dict(
        Opportunity.objects.annotate(f=lead_integrations.finalized_exists()).values_list("pk", "f")
    )
    assert flags[finalized.opportunity_id] is True and flags[open_ledger.opportunity_id] is False


def test_leads_finance_for_and_has_ledger(make_ledger):
    ledger = make_ledger(total="80000.00")
    assert lead_integrations.has_ledger(ledger.opportunity) is True
    finance = lead_integrations.finance_for(ledger.opportunity)
    assert finance["finalized"] is True and finance["total_amount"] == "80000.00"


def test_payments_received_adapter(make_ledger, make_payment):
    ledger = make_ledger()
    assert lead_integrations.payments_received(ledger.opportunity) is False
    make_payment(ledger, "5.00")
    assert lead_integrations.payments_received(ledger.opportunity) is True


def test_marking_a_lead_won_creates_the_ledger_and_finalize_works_through_leads(
    client_for, admin, sales_exec, make_opportunity, notes
):
    lead = make_opportunity(
        status=LeadStatus.INTERESTED, assigned_to=sales_exec, proposed_amount=Decimal("75000")
    )
    won = client_for(sales_exec).post(
        f"/api/v1/leads/{lead.lead_id}/status",
        {"status": "WON", "proposed_amount": "75000"},
        format="json",
    )
    assert won.status_code == 200, won.content
    ledger = Ledger.objects.get(opportunity=lead)
    assert ledger.total_amount == Decimal("75000.00") and ledger.finalized_at is None
    fin = client_for(admin).post(
        f"/api/v1/leads/{lead.lead_id}/finalize", {"amount": "70000"}, format="json"
    )
    assert fin.status_code == 200, fin.content
    assert (
        fin.json()["finance"]["finalized"] is True
        and fin.json()["finance"]["total_amount"] == "70000.00"
    )
    again = client_for(admin).post(
        f"/api/v1/leads/{lead.lead_id}/finalize", {"amount": "70000"}, format="json"
    )
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_finalized"


def test_a_won_lead_with_a_ledger_cannot_be_deleted_and_lost_removes_the_unpaid_ledger(
    client_for, admin, make_ledger
):
    ledger = make_ledger()
    assert (
        client_for(admin).delete(f"/api/v1/leads/{ledger.opportunity.lead_id}").status_code == 409
    )
    lost = client_for(admin).post(
        f"/api/v1/leads/{ledger.opportunity.lead_id}/status",
        {"status": "LOST", "lost_reason": "PRICE"},
        format="json",
    )
    assert lost.status_code == 200, lost.content
    assert not Ledger.objects.filter(pk=ledger.pk).exists()


@pytest.mark.parametrize("bad", ["0", "-5", "abc", "1.234"])
def test_finalize_ledger_rejects_bad_amounts_from_leads(make_opportunity, admin, bad):
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        services.finalize_ledger(make_opportunity(), bad, admin)


def test_finalize_ledger_is_admin_or_sales_manager(
    make_opportunity, sales_manager, sales_exec, pm
):
    from rest_framework.exceptions import PermissionDenied

    for user in (sales_exec, pm):
        with pytest.raises(PermissionDenied):
            services.finalize_ledger(make_opportunity(), Decimal("10"), user)
    assert services.finalize_ledger(make_opportunity(), Decimal("10"), sales_manager).finalized_at
    assert LEDGERS  # routes are registered
