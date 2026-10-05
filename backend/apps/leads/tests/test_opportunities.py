"""Opportunities: a lead is the client, each deal with it is an Opportunity (Deal #1, #2, ...)."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone

from apps.leads.models import Interaction, InteractionType, LeadStatus, Opportunity

from .conftest import BASE, deal_of, fresh

# ---- Migration ----------

BEFORE = [
    ("leads", "0002_seed_whatsapp_templates"),
    ("accounts", "0002_ledger_initial_amount"),
    ("projects", "0003_remove_sanctioned_budget"),
]
AFTER = [
    ("leads", "0005_drop_lead_deal_fields"),
    ("accounts", "0003_ledger_opportunity"),
    ("projects", "0004_project_opportunity"),
]


def _migrate(targets):
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(targets)
    return executor.loader.project_state(targets).apps


@pytest.mark.django_db(transaction=True)
def test_migration_turns_each_lead_into_opportunity_one(django_user_model):
    old = _migrate(BEFORE)
    user = django_user_model.objects.create(username="ex", role="SALES_EXEC")
    Lead = old.get_model("leads", "Lead")  # noqa: N806
    won_at = timezone.now() - timedelta(days=3)
    lead = Lead.objects.create(
        name="Old client",
        phone="+919800000001",
        status="WON",
        proposed_amount=Decimal("12345.00"),
        won_at=won_at,
        lost_reason="",
        lost_note="note",
        assigned_to_id=user.pk,
        created_by_id=user.pk,
    )
    Lead.objects.filter(pk=lead.pk).update(created_at=timezone.now() - timedelta(days=30))
    created = Lead.objects.get(pk=lead.pk).created_at
    lost = Lead.objects.create(
        name="Lost client", phone="+919800000002", status="LOST", lost_reason="PRICE"
    )
    old_interaction = old.get_model("leads", "Interaction")
    first = old_interaction.objects.create(lead_id=lead.pk, type="CALL", notes="hello")
    old_interaction.objects.create(lead_id=lost.pk, type="NOTE")
    ledger = old.get_model("accounts", "Ledger").objects.create(
        lead_id=lead.pk, total_amount=Decimal("12345.00")
    )
    project = old.get_model("projects", "Project").objects.create(
        name="P", client_name="Old client", lead_id=lead.pk
    )

    new = _migrate(AFTER)
    Opp = new.get_model("leads", "Opportunity")  # noqa: N806
    deals = list(Opp.objects.filter(lead_id=lead.pk))
    assert len(deals) == 1
    deal = deals[0]
    assert deal.sequence_no == 1 and deal.status == "WON"
    assert deal.proposed_amount == Decimal("12345.00") and deal.won_at == won_at
    assert deal.lost_note == "note" and deal.assigned_to_id == user.pk
    assert deal.created_by_id == user.pk and deal.created_at == created
    new_lead = new.get_model("leads", "Lead").objects.get(pk=lead.pk)
    assert new_lead.current_opportunity_id == deal.pk
    moved = new.get_model("leads", "Interaction").objects.get(pk=first.pk)
    assert moved.opportunity_id == deal.pk and moved.notes == "hello"
    lost_deal = Opp.objects.get(lead_id=lost.pk)
    assert lost_deal.status == "LOST" and lost_deal.lost_reason == "PRICE"
    assert new.get_model("accounts", "Ledger").objects.get(pk=ledger.pk).opportunity_id == deal.pk
    assert new.get_model("projects", "Project").objects.get(pk=project.pk).opportunity_id == deal.pk


# ---- One open deal at a time ----------


def start(client, lead, **body):
    return client.post(f"{BASE}/{lead.id}/opportunities", body, format="json")


def test_a_second_open_deal_is_refused(client_for, manager, make_lead):
    lead = make_lead(status=LeadStatus.CONTACTED)
    res = start(client_for(manager), lead)
    assert res.status_code == 409
    error = res.json()["error"]
    assert error["code"] == "opportunity_open"
    assert error["details"]["opportunity_id"] == deal_of(lead).pk
    assert Opportunity.objects.filter(lead=lead).count() == 1


@pytest.mark.parametrize(
    "closed", [{"status": LeadStatus.WON, "proposed_amount": 10}, {"status": LeadStatus.LOST}]
)
def test_a_new_deal_after_won_or_lost_is_deal_two(
    client_for, manager, exec_a, exec_b, make_lead, closed
):
    lead = make_lead(assigned_to=exec_a, **closed)
    first = deal_of(lead)
    res = start(client_for(manager), lead, requirements="Second turf", assigned_to=exec_b.pk)
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["sequence_no"] == 2 and body["status"] == "NEW" and body["is_current"] is True
    assert body["assigned_to"]["id"] == exec_b.pk and body["requirements"] == "Second turf"
    lead = fresh(lead)
    assert lead.current_opportunity_id == body["id"] and lead.status == "NEW"
    assert lead.assigned_to_id == exec_b.pk  # the lead follows its current deal's owner
    first.refresh_from_db()
    assert first.status == closed["status"]  # the old deal is untouched
    again = start(client_for(manager), lead)
    assert (
        again.status_code == 409
        and again.json()["error"]["details"]["opportunity_id"] == (body["id"])
    )


def test_only_admin_and_manager_start_deals(client_for, admin, exec_a, make_lead):
    lead = make_lead(assigned_to=exec_a, status=LeadStatus.LOST)
    assert start(client_for(exec_a), lead).status_code == 403
    assert start(client_for(admin), lead).status_code == 201


def test_an_exec_never_sees_another_execs_deals(client_for, exec_a, exec_b, make_lead):
    lead = make_lead(assigned_to=exec_b)
    assert client_for(exec_a).get(f"{BASE}/{lead.id}/opportunities").status_code == 404


# ---- List ----------


def test_all_leads_shows_every_status_by_default(client_for, manager, make_lead):
    ids = {make_lead(status=s, proposed_amount=5).id for s in LeadStatus}
    rows = client_for(manager).get(BASE).json()["results"]
    assert {r["id"] for r in rows} == ids
    assert {r["status"] for r in rows} == set(LeadStatus.values)


def test_default_order_is_most_recent_activity(client_for, manager, make_lead):
    older = make_lead(name="Older")
    newer = make_lead(name="Newer")
    ids = [r["id"] for r in client_for(manager).get(BASE).json()["results"]]
    assert ids == [newer.id, older.id]
    Interaction.objects.create(opportunity=deal_of(older), type=InteractionType.CALL)
    ids = [r["id"] for r in client_for(manager).get(BASE).json()["results"]]
    assert ids == [older.id, newer.id]
    named = client_for(manager).get(f"{BASE}?ordering=-last_activity_at").json()["results"]
    assert [r["id"] for r in named] == ids
    assert [
        r["id"] for r in client_for(manager).get(f"{BASE}?ordering=name").json()["results"]
    ] == [
        newer.id,
        older.id,
    ]


def test_list_row_shows_the_current_deal_and_the_deal_count(
    client_for, manager, make_lead, make_opportunity
):
    lead = make_lead(status=LeadStatus.WON, proposed_amount=100)
    make_opportunity(lead, proposed_amount=Decimal("250.00"))
    row = client_for(manager).get(BASE).json()["results"][0]
    assert row["status"] == "NEW" and row["proposed_amount"] == "250.00"
    assert row["deals_count"] == 2 and row["current_opportunity_id"] == deal_of(lead).pk


# ---- Detail ----------


def test_detail_lists_every_deal_newest_first(client_for, admin, make_lead, make_opportunity):
    lead = make_lead(status=LeadStatus.WON, proposed_amount=100)
    second = make_opportunity(lead)
    body = client_for(admin).get(f"{BASE}/{lead.id}").json()
    assert body["current_opportunity_id"] == second.pk
    assert [d["sequence_no"] for d in body["opportunities"]] == [2, 1]
    row = body["opportunities"][1]
    for key in ("id", "sequence_no", "status", "created_at", "won_at", "proposed_amount"):
        assert key in row
    assert {"project_id", "project_name", "ledger_id", "finance"} <= set(row)


def test_exec_deal_rows_carry_no_project_ledger_or_total(client_for, exec_a, make_lead):
    lead = make_lead(assigned_to=exec_a, status=LeadStatus.WON, proposed_amount=100)
    body = client_for(exec_a).get(f"{BASE}/{lead.id}").json()
    text = str(body["opportunities"])
    for key in ("project", "ledger", "finance", "total_amount"):
        assert key not in text
    assert "finance" not in body


# ---- Nested deal actions ----------


def test_each_deal_has_its_own_timeline(client_for, manager, make_lead, make_opportunity):
    lead = make_lead(status=LeadStatus.LOST, lost_reason="PRICE")
    first = deal_of(lead)
    second = make_opportunity(lead)
    c = client_for(manager)
    url = f"{BASE}/{lead.id}/opportunities/{second.pk}"
    assert c.post(f"{url}/interactions", {"type": "CALL"}, format="json").status_code == 201
    # The call, and the automatic NEW -> CONTACTED it caused: both on Deal #2 only.
    assert c.get(f"{url}/interactions").json()["count"] == 2
    old = c.get(f"{BASE}/{lead.id}/opportunities/{first.pk}/interactions").json()
    assert old["count"] == 0
    second.refresh_from_db()
    first.refresh_from_db()
    assert second.status == "CONTACTED" and first.status == "LOST"


def test_nested_status_change_moves_only_that_deal(client_for, manager, make_lead):
    lead = make_lead(status=LeadStatus.CONTACTED)
    deal = deal_of(lead)
    res = client_for(manager).post(
        f"{BASE}/{lead.id}/opportunities/{deal.pk}/status",
        {"status": "WON", "proposed_amount": "900"},
        format="json",
    )
    assert res.status_code == 200 and res.json()["status"] == "WON"
    deal.refresh_from_db()
    assert deal.won_at and deal.proposed_amount == Decimal("900.00")


def test_a_deal_of_another_lead_is_not_found(client_for, manager, make_lead):
    a = make_lead()
    b = make_lead()
    res = client_for(manager).get(f"{BASE}/{a.id}/opportunities/{deal_of(b).pk}")
    assert res.status_code == 404


def test_duplicate_check_stays_on_the_lead(client_for, manager, make_lead, make_opportunity):
    lead = make_lead(phone="+919811100000", status=LeadStatus.WON, proposed_amount=1)
    make_opportunity(lead)
    res = client_for(manager).get(f"{BASE}/check-duplicate?phone=9811100000").json()
    assert res["existing"]["id"] == lead.id and res["existing"]["status"] == "NEW"


def test_a_returning_client_notifies_the_sales_managers(client_for, manager, admin, make_lead):
    from apps.notifications.models import Notification

    lead = make_lead(status=LeadStatus.WON)
    assert start(client_for(admin), lead).status_code == 201
    note = Notification.objects.get(recipient=manager, type="lead_repeat_deal")
    assert lead.name in note.body
