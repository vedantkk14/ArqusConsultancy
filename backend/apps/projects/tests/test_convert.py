from decimal import Decimal

import pytest
from django.utils import timezone

from apps.leads.models import LeadStatus
from apps.projects import integrations, selectors, services
from apps.projects.models import Project

from .conftest import BASE, TOTAL


def payload(lead, **over):
    body = {
        "lead": lead.pk,
        "name": "Turf ground",
        "sanctioned_budget": "600000.00",
        "scope": "Everything",
    }
    body.update(over)
    return body


def test_convert_happy_path(client_for, admin, pm1, make_lead, notes):
    lead = make_lead()
    res = client_for(admin).post(
        BASE, payload(lead, pm=pm1.pk, start_date="2026-10-01"), format="json"
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["name"] == "Turf ground"
    assert body["client_name"] == lead.name
    assert body["pm"] == {"id": pm1.pk, "name": pm1.display_name}
    assert body["sanctioned_budget"] == "600000.00" and body["spent"] == "0.00"
    assert body["state"] == "ok" and body["usage_pct"] == "0.00"
    assert body["lead_id"] == lead.pk
    assert "add_expense" in body["allowed_actions"]
    project = Project.objects.get(pk=body["id"])
    assert project.lead_id == lead.pk and project.created_by_id == admin.pk
    assert project.events.filter(type="CREATED").exists()
    assert (pm1.pk, "project_assigned") == notes[0][:2]


def test_pm_is_optional_at_creation(client_for, admin, make_lead, notes):
    res = client_for(admin).post(BASE, payload(make_lead()), format="json")
    assert res.status_code == 201
    assert res.json()["pm"] is None and res.json()["pm_name"] is None
    assert notes == []


def test_only_admin_can_convert(client_for, pm1, sales_manager, sales_exec, make_lead):
    lead = make_lead()
    for user in (pm1, sales_manager, sales_exec):
        assert client_for(user).post(BASE, payload(lead), format="json").status_code == 403
    assert client_for().post(BASE, payload(lead), format="json").status_code == 401
    assert not Project.objects.exists()


@pytest.mark.parametrize(
    "status", [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.INTERESTED, LeadStatus.LOST]
)
def test_lead_must_be_won(client_for, admin, make_lead, status):
    res = client_for(admin).post(BASE, payload(make_lead(status=status)), format="json")
    assert res.status_code == 400 and res.json()["error"]["code"] == "not_won"


def test_deleted_lead_is_refused(client_for, admin, make_lead):
    lead = make_lead()
    lead.delete()  # soft delete
    res = client_for(admin).post(BASE, payload(lead), format="json")
    assert res.status_code == 400 and "lead" in res.json()["error"]["details"]


def test_a_lead_becomes_a_project_only_once(client_for, admin, make_lead):
    lead = make_lead()
    client = client_for(admin)
    first = client.post(BASE, payload(lead), format="json")
    second = client.post(BASE, payload(lead), format="json")  # a double click
    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "project_exists"
    assert second.json()["error"]["details"]["project_id"] == first.json()["id"]
    assert Project.objects.filter(lead=lead).count() == 1


def test_budget_must_be_positive_and_within_the_total(client_for, admin, make_lead):
    lead = make_lead()
    client = client_for(admin)
    for bad in ("0", "-1", "abc", "1.234"):
        res = client.post(BASE, payload(lead, sanctioned_budget=bad), format="json")
        assert res.status_code == 400, bad
        assert "sanctioned_budget" in res.json()["error"]["details"]
    too_much = client.post(BASE, payload(lead, sanctioned_budget="1000000.01"), format="json")
    assert too_much.status_code == 400
    assert too_much.json()["error"]["code"] == "budget_exceeds_total"
    exact = client.post(BASE, payload(lead, sanctioned_budget="1000000.00"), format="json")
    assert exact.status_code == 201


def test_assignee_must_be_an_active_project_manager(client_for, admin, make_lead, sales_exec, pm1):
    client = client_for(admin)
    res = client.post(BASE, payload(make_lead(), pm=sales_exec.pk), format="json")
    assert res.status_code == 400 and "pm" in res.json()["error"]["details"]
    pm1.is_active = False
    pm1.save()
    res = client.post(BASE, payload(make_lead(), pm=pm1.pk), format="json")
    assert res.status_code == 400 and "pm" in res.json()["error"]["details"]
    assert client.post(BASE, payload(make_lead(), pm=99999), format="json").status_code == 400


def test_end_date_cannot_precede_start_date(client_for, admin, make_lead):
    res = client_for(admin).post(
        BASE,
        payload(make_lead(), start_date="2026-10-10", expected_end_date="2026-10-01"),
        format="json",
    )
    assert res.status_code == 400 and "expected_end_date" in res.json()["error"]["details"]


def test_the_deal_total_comes_from_the_accounts_ledger(make_lead):
    from apps.accounts.models import Ledger

    assert integrations.accounts_ready() is True
    lead = make_lead(proposed_amount=Decimal("250000.00"))
    Ledger.objects.filter(lead=lead).update(total_amount=Decimal("300000.00"))
    assert integrations.deal_total(lead) == Decimal("300000.00")
    finance = integrations.finance_for(lead)
    assert finance["received"] == Decimal("0.00") and finance["finalized"] is True
    assert integrations.finalization_problem(lead) is None
    Ledger.objects.filter(lead=lead).update(finalized_at=None)
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


def test_with_accounts_the_ledger_total_is_the_ceiling(client_for, admin, make_lead, accounts):
    lead = make_lead()
    res = client_for(admin).post(BASE, payload(lead, sanctioned_budget="800000.01"), format="json")
    assert res.status_code == 400 and res.json()["error"]["code"] == "budget_exceeds_total"
    ok = client_for(admin).post(BASE, payload(lead, sanctioned_budget="800000.00"), format="json")
    assert ok.status_code == 201


def test_with_accounts_the_deal_must_be_finalized(client_for, admin, make_lead, accounts):
    accounts["result"]["finalized"] = False
    res = client_for(admin).post(BASE, payload(make_lead()), format="json")
    assert res.status_code == 409 and res.json()["error"]["code"] == "not_finalized"
    accounts["result"] = None  # no ledger at all
    res = client_for(admin).post(BASE, payload(make_lead()), format="json")
    assert res.status_code == 409 and res.json()["error"]["code"] == "not_finalized"


def test_admin_detail_carries_finance_and_margins(client_for, admin, pm1, make_lead, accounts):
    lead = make_lead()
    project = services.convert(
        lead.pk, name="P", sanctioned_budget=Decimal("500000"), pm_id=pm1.pk,
        start_date=None, expected_end_date=None, scope="", by=admin,
    )  # fmt: skip
    services.add_expense(
        project.pk, pm1,
        {"amount": Decimal("50000"), "category": "LABOUR", "spent_on": selectors.business_today()},
    )  # fmt: skip
    finance = client_for(admin).get(f"{BASE}/{project.pk}").json()["finance"]
    assert finance == {
        "total_amount": "800000.00",
        "received": "300000.00",
        "outstanding": "500000.00",
        "finalized": True,
        "planned_margin": "300000.00",  # total - sanctioned
        "live_margin": "250000.00",  # received - expenses
    }


def test_admin_detail_carries_the_ledger_finance(client_for, admin, project):
    finance = client_for(admin).get(f"{BASE}/{project.pk}").json()["finance"]
    assert finance["total_amount"] == "1000000.00" and finance["received"] == "0.00"
    assert finance["planned_margin"] == "400000.00" and finance["live_margin"] == "0.00"


def test_convertible_lists_only_eligible_deals(client_for, admin, make_lead):
    ready = make_lead(name="Ready", won_at=timezone.now())
    make_lead(name="Open", status=LeadStatus.INTERESTED)
    converted = make_lead(name="Done")
    services.convert(converted.pk, name="D", sanctioned_budget=Decimal("100"), pm_id=None,
                     start_date=None, expected_end_date=None, scope="", by=admin)  # fmt: skip
    body = client_for(admin).get(f"{BASE}/convertible").json()
    assert [r["name"] for r in body["results"]] == ["Ready"]
    row = body["results"][0]
    assert row["lead"] == ready.pk and row["ineligible_reason"] is None
    assert row["total_amount"] == "1000000.00" and row["suggested_budget"] == "600000.00"


def test_convertible_lookup_explains_why_a_lead_is_not_ready(client_for, admin, make_lead):
    open_lead = make_lead(status=LeadStatus.CONTACTED)
    done = make_lead()
    project = services.convert(
        done.pk,
        name="D",
        sanctioned_budget=Decimal("100"),
        pm_id=None,
        start_date=None,
        expected_end_date=None,
        scope="",
        by=admin,
    )
    client = client_for(admin)
    row = client.get(f"{BASE}/convertible?lead={open_lead.pk}").json()["results"][0]
    assert row["ineligible_reason"] == "not_won"
    row = client.get(f"{BASE}/convertible?lead={done.pk}").json()["results"][0]
    assert row["ineligible_reason"] == "project_exists" and row["project_id"] == project.pk
    assert client.get(f"{BASE}/convertible?lead=99999").json()["results"] == []


def test_suggested_budget_is_sixty_percent_as_a_string(make_lead):
    from apps.projects.selectors import suggested_budget

    assert suggested_budget(Decimal("999999.99")) == "599999.99"
    assert suggested_budget(None) is None
    assert TOTAL * Decimal("0.6") == Decimal("600000.00")


def test_managers_lists_active_pms_with_running_counts(client_for, admin, pm1, pm2, make_project):
    make_project(pm=pm1)
    make_project(pm=pm1)
    pm2.is_active = False
    pm2.save()
    rows = client_for(admin).get(f"{BASE}/managers").json()
    assert rows == [{"id": pm1.pk, "name": pm1.display_name, "running_projects": 2}]
