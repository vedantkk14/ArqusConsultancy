"""My Clients (admin): clients with projects, and adding the next project for one of them."""

from decimal import Decimal

from apps.accounts.models import Ledger
from apps.leads.models import LeadStatus, Opportunity
from apps.leads.services import add_opportunity
from apps.projects.models import Project

CLIENTS = "/api/v1/clients"


def _add(client, lead_id, **body):
    payload = {"name": "Turf phase 2", "amount": "250000.00", "requirements": "Extra courts"}
    payload.update(body)
    return client.post(f"{CLIENTS}/{lead_id}/projects", payload, format="json")


def test_lists_only_clients_with_projects_with_running_and_completed_counts(
    client_for, admin, pm1, make_project, make_opportunity
):
    done = make_project(pm=pm1, name="Old job")
    client_for(admin).post(f"/api/v1/projects/{done.pk}/complete")
    running = make_project(pm=pm1, name="Live job")
    make_opportunity(name="Never converted")  # a won deal without a project is not a client yet
    body = client_for(admin).get(CLIENTS).json()
    assert body["count"] == 2
    names = {row["name"]: row for row in body["results"]}
    assert "Never converted" not in names
    assert names[done.opportunity.lead.name]["completed_projects"] == 1
    assert names[running.opportunity.lead.name]["running_projects"] == 1
    row = names[running.opportunity.lead.name]
    assert row["projects"][0]["name"] == "Live job" and row["projects"][0]["pm_name"]
    assert "amount" not in str(row) and "budget" not in str(row)


def test_search_finds_a_client_by_name_phone_or_email(client_for, admin, pm1, make_project):
    project = make_project(pm=pm1)
    lead = project.opportunity.lead
    make_project(pm=pm1)
    c = client_for(admin)
    for term in (lead.name, lead.phone[-6:], lead.email):
        rows = c.get(CLIENTS, {"q": term}).json()["results"]
        assert [r["id"] for r in rows] == [lead.pk], term


def test_only_the_admin_can_use_it(client_for, sales_manager, sales_exec, pm1, make_project):
    project = make_project(pm=pm1)
    lead_id = project.opportunity.lead_id
    for user in (sales_manager, sales_exec, pm1):
        c = client_for(user)
        assert c.get(CLIENTS).status_code == 403
        assert _add(c, lead_id).status_code == 403
    assert Project.objects.count() == 1


def test_add_project_makes_the_clients_next_deal_and_project(
    client_for, admin, pm1, pm2, make_project
):
    first = make_project(pm=pm1, name="Turf phase 1")
    lead = first.opportunity.lead
    res = _add(client_for(admin), lead.pk, pm=pm2.pk, start_date="2026-11-01")
    assert res.status_code == 201, res.content
    project = Project.objects.get(pk=res.json()["project"])
    assert project.name == "Turf phase 2" and project.pm_id == pm2.pk
    assert project.client_name == lead.name and project.scope == "Extra courts"
    deal = project.opportunity
    assert deal.lead_id == lead.pk and deal.sequence_no == 2 and deal.status == LeadStatus.WON
    assert deal.requirements == "Extra courts"
    ledger = Ledger.objects.get(opportunity=deal)
    assert ledger.total_amount == Decimal("250000.00") and ledger.finalized_at is not None
    row = res.json()["client"]
    assert row["total_projects"] == 2 and row["running_projects"] == 2
    assert [p["no"] for p in row["projects"]] == [1, 2]
    # The first project and its deal are untouched.
    first.refresh_from_db()
    assert first.opportunity.sequence_no == 1


def test_pm_is_optional_and_can_be_assigned_later(client_for, admin, pm1, make_project):
    lead = make_project(pm=pm1).opportunity.lead
    res = _add(client_for(admin), lead.pk)
    assert res.status_code == 201
    assert Project.objects.get(pk=res.json()["project"]).pm_id is None


def test_a_client_with_an_open_deal_must_close_it_first(client_for, admin, pm1, make_project):
    lead = make_project(pm=pm1).opportunity.lead
    add_opportunity(lead, status=LeadStatus.CONTACTED)
    res = _add(client_for(admin), lead.pk)
    assert res.status_code == 409 and res.json()["error"]["code"] == "opportunity_open"
    assert Project.objects.count() == 1


def test_bad_input_creates_nothing(
    client_for, admin, pm1, sales_exec, make_project, make_opportunity
):
    lead = make_project(pm=pm1).opportunity.lead
    c = client_for(admin)
    deals_before = Opportunity.objects.count()
    for body in (
        {"amount": ""},  # no price
        {"amount": "0"},
        {"name": ""},
        {"pm": sales_exec.pk},  # not a project manager
        {"start_date": "2026-12-01", "expected_end_date": "2026-11-01"},
    ):
        assert _add(c, lead.pk, **body).status_code == 400, body
    unconverted = make_opportunity(name="Lonely").lead  # has no project: not a client
    assert _add(c, unconverted.pk).status_code in (400, 404)
    assert Opportunity.objects.count() == deals_before + 1  # only the fixture's own deal
    assert Project.objects.count() == 1
