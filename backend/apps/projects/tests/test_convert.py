from decimal import Decimal

import pytest
from django.utils import timezone

from apps.leads.models import LeadStatus
from apps.projects import integrations, selectors, services
from apps.projects.models import Project

from .conftest import BASE


def payload(lead, **over):
    body = {
        "opportunity": lead.pk,
        "name": "Turf ground",
        "scope": "Everything",
    }
    body.update(over)
    return body


def test_convert_happy_path(client_for, admin, pm1, make_opportunity, notes):
    lead = make_opportunity()
    res = client_for(admin).post(
        BASE, payload(lead, pm=pm1.pk, start_date="2026-10-01"), format="json"
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["name"] == "Turf ground"
    assert body["client_name"] == lead.lead.name
    assert body["pm"] == {"id": pm1.pk, "name": pm1.display_name}
    assert "sanctioned_budget" not in body
    assert body["total_budget"] == "1000000.00" and body["spent"] == "0.00"
    assert body["remaining"] == "1000000.00"
    assert body["state"] == "ok" and body["usage_pct"] == "0.00"
    assert body["lead_id"] == lead.lead_id and body["opportunity_id"] == lead.pk
    assert "add_expense" in body["allowed_actions"]
    project = Project.objects.get(pk=body["id"])
    assert project.opportunity_id == lead.pk and project.created_by_id == admin.pk
    assert project.events.filter(type="CREATED").exists()
    assert (pm1.pk, "project_assigned") == notes[0][:2]


def test_pm_is_optional_at_creation(client_for, admin, make_opportunity, notes):
    res = client_for(admin).post(BASE, payload(make_opportunity()), format="json")
    assert res.status_code == 201
    assert res.json()["pm"] is None and res.json()["pm_name"] is None
    assert notes == []


def test_only_admin_can_convert(client_for, pm1, sales_manager, sales_exec, make_opportunity):
    lead = make_opportunity()
    for user in (pm1, sales_manager, sales_exec):
        assert client_for(user).post(BASE, payload(lead), format="json").status_code == 403
    assert client_for().post(BASE, payload(lead), format="json").status_code == 401
    assert not Project.objects.exists()


@pytest.mark.parametrize(
    "status", [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.INTERESTED, LeadStatus.LOST]
)
def test_lead_must_be_won(client_for, admin, make_opportunity, status):
    res = client_for(admin).post(BASE, payload(make_opportunity(status=status)), format="json")
    assert res.status_code == 400 and res.json()["error"]["code"] == "not_won"


def test_deleted_lead_is_refused(client_for, admin, make_opportunity):
    lead = make_opportunity()
    lead.lead.delete()  # soft delete the client
    res = client_for(admin).post(BASE, payload(lead), format="json")
    assert res.status_code == 400 and "opportunity" in res.json()["error"]["details"]


def test_a_lead_becomes_a_project_only_once(client_for, admin, make_opportunity):
    lead = make_opportunity()
    client = client_for(admin)
    first = client.post(BASE, payload(lead), format="json")
    second = client.post(BASE, payload(lead), format="json")  # a double click
    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "project_exists"
    assert second.json()["error"]["details"]["project_id"] == first.json()["id"]
    assert Project.objects.filter(opportunity=lead).count() == 1


def test_a_budget_sent_with_the_request_is_ignored(client_for, admin, make_opportunity):
    res = client_for(admin).post(
        BASE, payload(make_opportunity(), sanctioned_budget="5.00"), format="json"
    )
    assert res.status_code == 201 and "sanctioned_budget" not in res.json()


def test_assignee_must_be_an_active_project_manager(
    client_for, admin, make_opportunity, sales_exec, pm1
):
    client = client_for(admin)
    res = client.post(BASE, payload(make_opportunity(), pm=sales_exec.pk), format="json")
    assert res.status_code == 400 and "pm" in res.json()["error"]["details"]
    pm1.is_active = False
    pm1.save()
    res = client.post(BASE, payload(make_opportunity(), pm=pm1.pk), format="json")
    assert res.status_code == 400 and "pm" in res.json()["error"]["details"]
    assert (
        client.post(BASE, payload(make_opportunity(), pm=99999), format="json").status_code == 400
    )


def test_end_date_cannot_precede_start_date(client_for, admin, make_opportunity):
    res = client_for(admin).post(
        BASE,
        payload(make_opportunity(), start_date="2026-10-10", expected_end_date="2026-10-01"),
        format="json",
    )
    assert res.status_code == 400 and "expected_end_date" in res.json()["error"]["details"]


def test_the_deal_total_comes_from_the_accounts_ledger(make_opportunity):
    from apps.accounts.models import Ledger

    assert integrations.accounts_ready() is True
    lead = make_opportunity(proposed_amount=Decimal("250000.00"))
    Ledger.objects.filter(opportunity=lead).update(total_amount=Decimal("300000.00"))
    assert integrations.deal_total(lead) == Decimal("300000.00")
    finance = integrations.finance_for(lead)
    assert finance["received"] == Decimal("0.00") and finance["finalized"] is True
    assert integrations.finalization_problem(lead) is None
    Ledger.objects.filter(opportunity=lead).update(finalized_at=None)
    assert integrations.finalization_problem(lead) == "not_finalized"


@pytest.fixture
def accounts(monkeypatch):
    """Pretend Dev C's get_project_finance exists."""
    from apps.accounts import services as accounts_services

    state = {
        "result": {
            "total_amount": "800000.00",
            "received": "300000.00",
            "outstanding": "500000.00",
            "finalized": True,
        }
    }
    monkeypatch.setattr(
        accounts_services, "get_project_finance", lambda lead: state["result"], raising=False
    )
    return state


def test_with_accounts_the_deal_must_be_finalized(client_for, admin, make_opportunity, accounts):
    accounts["result"]["finalized"] = False
    res = client_for(admin).post(BASE, payload(make_opportunity()), format="json")
    assert res.status_code == 409 and res.json()["error"]["code"] == "not_finalized"
    accounts["result"] = None  # no ledger at all
    res = client_for(admin).post(BASE, payload(make_opportunity()), format="json")
    assert res.status_code == 409 and res.json()["error"]["code"] == "not_finalized"


def test_admin_detail_carries_finance_and_margins(
    client_for, admin, pm1, make_opportunity, accounts
):
    lead = make_opportunity()
    project = services.convert(
        lead.pk, name="P", pm_id=pm1.pk,
        start_date=None, expected_end_date=None, scope="", by=admin,
    )  # fmt: skip
    services.add_expense(
        project.pk, pm1,
        {"amount": Decimal("50000"), "category": "LABOUR", "spent_on": selectors.business_today()},
    )  # fmt: skip
    finance = client_for(admin).get(f"{BASE}/{project.pk}").json()["finance"]
    finance.pop("ledger_id")  # this test's `accounts` fixture is a bare mock, no real ledger
    assert finance == {
        "total_amount": "800000.00",
        "received": "300000.00",
        "outstanding": "500000.00",
        "finalized": True,
        "live_margin": "250000.00",  # received - expenses
    }


def test_admin_detail_carries_the_ledger_finance(client_for, admin, project):
    finance = client_for(admin).get(f"{BASE}/{project.pk}").json()["finance"]
    assert finance["total_amount"] == "1000000.00" and finance["received"] == "0.00"
    assert finance["live_margin"] == "0.00" and "planned_margin" not in finance


def test_convertible_lists_only_eligible_deals(client_for, admin, make_opportunity):
    ready = make_opportunity(name="Ready", won_at=timezone.now())
    make_opportunity(name="Open", status=LeadStatus.INTERESTED)
    converted = make_opportunity(name="Done")
    services.convert(converted.pk, name="D", pm_id=None,
                     start_date=None, expected_end_date=None, scope="", by=admin)  # fmt: skip
    body = client_for(admin).get(f"{BASE}/convertible").json()
    assert [r["name"] for r in body["results"]] == ["Ready"]
    row = body["results"][0]
    assert (
        row["opportunity"] == ready.pk
        and row["lead"] == ready.lead_id
        and row["ineligible_reason"] is None
    )
    assert row["total_amount"] == "1000000.00" and "suggested_budget" not in row


def test_convertible_lookup_explains_why_a_lead_is_not_ready(client_for, admin, make_opportunity):
    open_lead = make_opportunity(status=LeadStatus.CONTACTED)
    done = make_opportunity()
    project = services.convert(
        done.pk,
        name="D",
        pm_id=None,
        start_date=None,
        expected_end_date=None,
        scope="",
        by=admin,
    )
    client = client_for(admin)
    row = client.get(f"{BASE}/convertible?opportunity={open_lead.pk}").json()["results"][0]
    assert row["ineligible_reason"] == "not_won"
    row = client.get(f"{BASE}/convertible?opportunity={done.pk}").json()["results"][0]
    assert row["ineligible_reason"] == "project_exists" and row["project_id"] == project.pk
    assert client.get(f"{BASE}/convertible?opportunity=99999").json()["results"] == []


def test_managers_lists_active_pms_with_running_counts(client_for, admin, pm1, pm2, make_project):
    make_project(pm=pm1)
    make_project(pm=pm1)
    pm2.is_active = False
    pm2.save()
    rows = client_for(admin).get(f"{BASE}/managers").json()
    assert rows == [{"id": pm1.pk, "name": pm1.display_name, "running_projects": 2}]
