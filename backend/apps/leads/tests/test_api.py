"""Leads API: permissions, scoping, state machine, assignment, duplicates, filters, privacy, CSV."""

from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.leads import integrations
from apps.leads.models import Interaction, InteractionType, Lead, LeadStatus, WhatsAppTemplate

from .conftest import BASE

pytestmark = pytest.mark.django_db
IST = ZoneInfo("Asia/Kolkata")
FORBIDDEN_KEYS = {"ledger", "payment", "project", "total_amount", "final_amount", "finance"}


def keys_in(data) -> set[str]:
    found = set()
    if isinstance(data, dict):
        for key, value in data.items():
            found.add(key)
            found |= keys_in(value)
    elif isinstance(data, list):
        for item in data:
            found |= keys_in(item)
    return found


def err(response) -> str:
    return response.json()["error"]["code"]


# ---- Permission matrix ----------


def test_unauthenticated_gets_401(client_for):
    assert client_for().get(BASE).status_code == 401


def test_pm_is_refused_everywhere(client_for, pm, make_lead):
    lead = make_lead()
    c = client_for(pm)
    calls = [
        ("get", BASE),
        ("get", f"{BASE}/summary"),
        ("post", BASE),
        ("get", f"{BASE}/check-duplicate?phone=9876543210"),
        ("get", f"{BASE}/assignees"),
        ("post", f"{BASE}/bulk-assign"),
        ("get", f"{BASE}/export"),
        ("get", f"{BASE}/whatsapp-templates"),
        ("get", f"{BASE}/{lead.id}"),
        ("patch", f"{BASE}/{lead.id}"),
        ("delete", f"{BASE}/{lead.id}"),
        ("post", f"{BASE}/{lead.id}/status"),
        ("get", f"{BASE}/{lead.id}/interactions"),
        ("post", f"{BASE}/{lead.id}/interactions"),
        ("post", f"{BASE}/{lead.id}/assign"),
        ("post", f"{BASE}/{lead.id}/whatsapp"),
        ("post", f"{BASE}/{lead.id}/finalize"),
    ]
    for method, url in calls:
        assert getattr(c, method)(url, {}, format="json").status_code == 403, (method, url)


@pytest.mark.parametrize(
    "role, create, check_dup, assignees, export",
    [
        ("ADMIN", 201, 200, 200, 200),
        ("SALES_MANAGER", 201, 200, 200, 200),
        ("SALES_EXEC", 403, 403, 403, 403),
    ],
)
def test_manager_only_endpoints(client_for, make_user, role, create, check_dup, assignees, export):
    c = client_for(make_user(role))
    body = {"name": "Rahul", "phone": "9876543210"}
    assert c.post(BASE, body, format="json").status_code == create
    assert c.get(f"{BASE}/check-duplicate?phone=9876543210").status_code == check_dup
    assert c.get(f"{BASE}/assignees").status_code == assignees
    assert c.get(f"{BASE}/export").status_code == export


def test_finalize_and_delete_are_admin_only(client_for, manager, exec_a, make_lead):
    lead = make_lead(status=LeadStatus.WON, assigned_to=exec_a, proposed_amount=100)
    for user in (manager, exec_a):
        c = client_for(user)
        assert c.post(f"{BASE}/{lead.id}/finalize", {"amount": "100"}).status_code == 403
        assert c.delete(f"{BASE}/{lead.id}").status_code == 403


def test_exec_patch_is_limited(client_for, exec_a, exec_b, make_lead, future):
    lead = make_lead(assigned_to=exec_a)
    c = client_for(exec_a)
    ok = c.patch(
        f"{BASE}/{lead.id}",
        {"email": "r@x.com", "requirements": "Turf", "next_followup_at": future.isoformat()},
        format="json",
    )
    assert ok.status_code == 200
    for field, value in [("status", "WON"), ("assigned_to", exec_b.id), ("name", "X")]:
        r = c.patch(f"{BASE}/{lead.id}", {field: value}, format="json")
        assert r.status_code == 400 and field in r.json()["error"]["details"]
    lead.refresh_from_db()
    assert lead.status == LeadStatus.NEW and lead.assigned_to == exec_a


# ---- Scoping ----------


def test_exec_cannot_touch_other_execs_leads(client_for, exec_a, exec_b, make_lead):
    theirs = make_lead(assigned_to=exec_b, phone="+919000000001")
    mine = make_lead(assigned_to=exec_a)
    c = client_for(exec_a)
    for method, url, body in [
        ("get", f"{BASE}/{theirs.id}", {}),
        ("patch", f"{BASE}/{theirs.id}", {"email": "a@b.com"}),
        ("post", f"{BASE}/{theirs.id}/interactions", {"type": "CALL"}),
        ("post", f"{BASE}/{theirs.id}/status", {"status": "CONTACTED"}),
        ("post", f"{BASE}/{theirs.id}/whatsapp", {"template_id": 1}),
    ]:
        assert getattr(c, method)(url, body, format="json").status_code == 404, url
    ids = [row["id"] for row in c.get(BASE).json()["results"]]
    assert ids == [mine.id]
    summary = c.get(f"{BASE}/summary").json()
    assert sum(s["count"] for s in summary["by_status"]) == 1


def test_exec_responses_never_contain_finance_keys(client_for, exec_a, make_lead):
    lead = make_lead(status=LeadStatus.WON, assigned_to=exec_a, proposed_amount=500)
    c = client_for(exec_a)
    assert not keys_in(c.get(f"{BASE}/{lead.id}").json()) & FORBIDDEN_KEYS
    assert not keys_in(c.get(BASE).json()) & FORBIDDEN_KEYS
    assert not keys_in(c.get(f"{BASE}/summary").json()) & FORBIDDEN_KEYS


def test_managers_see_finance_block(client_for, manager, make_lead):
    lead = make_lead(status=LeadStatus.WON, proposed_amount=500)
    data = client_for(manager).get(f"{BASE}/{lead.id}").json()
    assert data["finance"] == {"finalized": False, "total_amount": None, "finalized_at": None}


# ---- State machine ----------

VALID = [
    ("NEW", "CONTACTED"),
    ("NEW", "LOST"),
    ("CONTACTED", "INTERESTED"),
    ("CONTACTED", "WON"),
    ("CONTACTED", "LOST"),
    ("INTERESTED", "WON"),
    ("WON", "LOST"),
    ("INTERESTED", "LOST"),
    ("LOST", "CONTACTED"),
]
ALL = ["NEW", "CONTACTED", "INTERESTED", "WON", "LOST"]


@pytest.mark.parametrize("src, dst", [(s, d) for s in ALL for d in ALL if s != d])
def test_transitions(client_for, manager, make_lead, src, dst):
    lead = make_lead(status=src, proposed_amount=1000)
    body = {"status": dst, "lost_reason": "PRICE"}
    r = client_for(manager).post(f"{BASE}/{lead.id}/status", body, format="json")
    if (src, dst) in VALID:
        assert r.status_code == 200, r.json()
        assert r.json()["status"] == dst
    else:
        assert r.status_code == 400 and err(r) == "invalid_transition"
        assert "allowed" in r.json()["error"]["details"]


def test_reopen_is_manager_and_admin_only(client_for, exec_a, make_lead):
    lead = make_lead(status=LeadStatus.LOST, assigned_to=exec_a, lost_reason="PRICE")
    c = client_for(exec_a)
    assert c.get(f"{BASE}/{lead.id}").json()["allowed_transitions"] == []
    r = c.post(f"{BASE}/{lead.id}/status", {"status": "CONTACTED"}, format="json")
    assert err(r) == "invalid_transition"


def test_won_needs_amount_and_clears_followup(client_for, manager, make_lead, future):
    lead = make_lead(status=LeadStatus.CONTACTED, next_followup_at=future)
    c = client_for(manager)
    r = c.post(f"{BASE}/{lead.id}/status", {"status": "WON"}, format="json")
    assert r.status_code == 400 and "proposed_amount" in r.json()["error"]["details"]
    r = c.post(
        f"{BASE}/{lead.id}/status", {"status": "WON", "proposed_amount": "250000"}, format="json"
    )
    assert r.status_code == 200
    data = r.json()
    assert data["proposed_amount"] == "250000.00"
    assert data["next_followup_at"] is None and data["won_at"]


def test_lost_needs_reason_and_clears_followup(client_for, manager, make_lead, future):
    lead = make_lead(status=LeadStatus.CONTACTED, next_followup_at=future)
    c = client_for(manager)
    r = c.post(f"{BASE}/{lead.id}/status", {"status": "LOST"}, format="json")
    assert "lost_reason" in r.json()["error"]["details"]
    r = c.post(
        f"{BASE}/{lead.id}/status",
        {"status": "LOST", "lost_reason": "COMPETITOR", "lost_note": "Cheaper"},
        format="json",
    )
    lead.refresh_from_db()
    assert r.status_code == 200 and lead.next_followup_at is None
    assert lead.lost_reason == "COMPETITOR" and lead.lost_note == "Cheaper"


def test_won_creates_ledger_once_and_notifies_admins(client_for, admin, exec_a, make_lead):
    lead = make_lead(status=LeadStatus.CONTACTED, assigned_to=exec_a, proposed_amount=900)
    c = client_for(exec_a)
    with (
        mock.patch("apps.accounts.services.create_ledger") as create_ledger,
        mock.patch.object(integrations, "_notify") as notify,
    ):
        for _ in range(3):
            assert c.post(f"{BASE}/{lead.id}/status", {"status": "WON"}).status_code == 200
    create_ledger.assert_called_once()
    won_calls = [call for call in notify.call_args_list if call.args[1] == "lead_won"]
    assert [call.args[0] for call in won_calls] == [admin]


def test_status_changes_are_logged(client_for, manager, make_lead):
    lead = make_lead()
    client_for(manager).post(f"{BASE}/{lead.id}/status", {"status": "CONTACTED"})
    row = Interaction.objects.get(lead=lead, type=InteractionType.STATUS_CHANGE)
    assert (row.from_status, row.to_status) == ("NEW", "CONTACTED")


# ---- Interactions ----------


@pytest.mark.parametrize("kind", ["CALL", "WHATSAPP", "EMAIL", "MEETING"])
def test_first_outbound_moves_new_to_contacted(client_for, exec_a, make_lead, kind):
    lead = make_lead(assigned_to=exec_a)
    r = client_for(exec_a).post(f"{BASE}/{lead.id}/interactions", {"type": kind, "notes": "hi"})
    assert r.status_code == 201
    lead.refresh_from_db()
    assert lead.status == LeadStatus.CONTACTED


def test_note_never_changes_status(client_for, exec_a, make_lead):
    lead = make_lead(assigned_to=exec_a)
    client_for(exec_a).post(f"{BASE}/{lead.id}/interactions", {"type": "NOTE", "notes": "x"})
    lead.refresh_from_db()
    assert lead.status == LeadStatus.NEW


def test_interaction_can_set_its_own_status_and_followup(client_for, exec_a, make_lead, future):
    lead = make_lead(assigned_to=exec_a)
    r = client_for(exec_a).post(
        f"{BASE}/{lead.id}/interactions",
        {"type": "CALL", "new_status": "LOST", "lost_reason": "PRICE"},
        format="json",
    )
    assert r.status_code == 201
    lead.refresh_from_db()
    assert lead.status == LeadStatus.LOST
    lead2 = make_lead(assigned_to=exec_a)
    client_for(exec_a).post(
        f"{BASE}/{lead2.id}/interactions",
        {"type": "CALL", "next_followup_at": future.isoformat()},
        format="json",
    )
    lead2.refresh_from_db()
    assert lead2.next_followup_at is not None


def test_users_cannot_create_system_types(client_for, manager, make_lead):
    lead = make_lead()
    for kind in ("STATUS_CHANGE", "ASSIGNMENT", "AMOUNT_CHANGE"):
        r = client_for(manager).post(f"{BASE}/{lead.id}/interactions", {"type": kind})
        assert r.status_code == 400


def test_interactions_are_append_only(client_for, manager, make_lead):
    lead = make_lead()
    c = client_for(manager)
    c.post(f"{BASE}/{lead.id}/interactions", {"type": "NOTE", "notes": "a"})
    url = f"{BASE}/{lead.id}/interactions"
    assert c.put(url, {}).status_code == 405
    assert c.delete(url).status_code == 405
    listing = c.get(url).json()
    assert listing["count"] == 1 and listing["results"][0]["notes"] == "a"


def test_followup_in_past_and_on_closed(client_for, manager, make_lead):
    lead = make_lead()
    c = client_for(manager)
    past = (timezone.now() - timedelta(hours=1)).isoformat()
    r = c.patch(f"{BASE}/{lead.id}", {"next_followup_at": past}, format="json")
    assert err(r) == "followup_in_past"
    within = (timezone.now() - timedelta(minutes=2)).isoformat()
    assert (
        c.patch(f"{BASE}/{lead.id}", {"next_followup_at": within}, format="json").status_code == 200
    )
    won = make_lead(status=LeadStatus.WON, proposed_amount=1)
    future = (timezone.now() + timedelta(days=1)).isoformat()
    r = c.patch(f"{BASE}/{won.id}", {"next_followup_at": future}, format="json")
    assert err(r) == "followup_on_closed"


def test_amount_change_is_logged(client_for, manager, make_lead):
    lead = make_lead(proposed_amount=100)
    client_for(manager).patch(f"{BASE}/{lead.id}", {"proposed_amount": "250.50"}, format="json")
    row = Interaction.objects.get(lead=lead, type=InteractionType.AMOUNT_CHANGE)
    assert row.meta == {"from": "100.00", "to": "250.50"}


# ---- Create, duplicates, assignment ----------


def test_create_normalises_phone_and_detects_duplicates(client_for, manager, exec_a, make_lead):
    existing = make_lead(phone="+919876543210", name="Rahul", assigned_to=exec_a)
    c = client_for(manager)
    r = c.post(BASE, {"name": "Rahul S", "phone": "098765 43210"}, format="json")
    assert r.status_code == 409 and err(r) == "duplicate_lead"
    assert r.json()["error"]["details"]["existing"]["id"] == existing.id
    dup = c.get(f"{BASE}/check-duplicate?phone=9876543210").json()["existing"]
    assert dup["assigned_to_name"] == exec_a.display_name
    r = c.post(BASE, {"name": "Rahul S", "phone": "098765 43210", "force": True}, format="json")
    assert r.status_code == 201 and r.json()["phone"] == "+919876543210"
    assert c.get(f"{BASE}/check-duplicate?phone=9123456789").json() == {"existing": None}


def test_create_validates_phone_and_email(client_for, manager):
    c = client_for(manager)
    r = c.post(BASE, {"name": "A", "phone": "12345", "email": "nope"}, format="json")
    assert r.status_code == 400
    assert {"phone", "email"} <= set(r.json()["error"]["details"])


def test_create_with_assignee_notifies_and_logs(client_for, manager, exec_a):
    with mock.patch.object(integrations, "_notify") as notify:
        r = client_for(manager).post(
            BASE, {"name": "A", "phone": "9876500000", "assigned_to": exec_a.id}, format="json"
        )
    assert r.status_code == 201
    notify.assert_called_once_with(exec_a, "lead_assigned", mock.ANY)
    assert Interaction.objects.filter(type=InteractionType.ASSIGNMENT).count() == 1


def test_only_active_execs_can_be_assigned(client_for, manager, make_user, make_lead):
    lead = make_lead()
    c = client_for(manager)
    for bad in (make_user("SALES_EXEC", is_active=False), make_user("PROJECT_MANAGER"), manager):
        r = c.post(f"{BASE}/{lead.id}/assign", {"assigned_to": bad.id})
        assert r.status_code == 400 and "assigned_to" in r.json()["error"]["details"]


def test_reassign_notifies_both(client_for, manager, exec_a, exec_b, make_lead):
    lead = make_lead(assigned_to=exec_a)
    with mock.patch.object(integrations, "_notify") as notify:
        r = client_for(manager).post(f"{BASE}/{lead.id}/assign", {"assigned_to": exec_b.id})
    assert r.status_code == 200 and r.json()["assigned_to"]["id"] == exec_b.id
    assert {(c.args[0], c.args[1]) for c in notify.call_args_list} == {
        (exec_b, "lead_assigned"),
        (exec_a, "lead_reassigned_away"),
    }
    assert (
        Interaction.objects.get(lead=lead, type=InteractionType.ASSIGNMENT).meta["from"]
        == exec_a.id
    )


def test_bulk_assign_is_atomic_and_limited(client_for, manager, exec_a, make_lead):
    leads = [make_lead() for _ in range(3)]
    c = client_for(manager)
    r = c.post(
        f"{BASE}/bulk-assign",
        {"ids": [leads[0].id, 999999], "assigned_to": exec_a.id},
        format="json",
    )
    assert r.status_code == 400
    assert not Lead.objects.filter(assigned_to=exec_a).exists()
    r = c.post(
        f"{BASE}/bulk-assign", {"ids": list(range(1, 102)), "assigned_to": exec_a.id}, format="json"
    )
    assert r.status_code == 400
    r = c.post(
        f"{BASE}/bulk-assign",
        {"ids": [x.id for x in leads], "assigned_to": exec_a.id},
        format="json",
    )
    assert r.json() == {"assigned": 3}


def test_assignees_have_open_counts(client_for, manager, exec_a, make_lead):
    make_lead(assigned_to=exec_a)
    make_lead(assigned_to=exec_a, status=LeadStatus.WON, proposed_amount=1)
    rows = client_for(manager).get(f"{BASE}/assignees").json()
    assert {
        "id": exec_a.id,
        "name": exec_a.display_name,
        "role": "SALES_EXEC",
        "open_count": 1,
    } in rows


# ---- Finalize, delete, WhatsApp ----------


def test_finalize_reports_accounts_not_ready(client_for, admin, make_lead, monkeypatch):
    """If the accounts adapter is unavailable, finalize says what is missing instead of failing."""
    from apps.leads import integrations

    monkeypatch.setattr(integrations, "accounts_missing", lambda: ["accounts.Ledger"])
    lead = make_lead(status=LeadStatus.WON, proposed_amount=100)
    with mock.patch.object(integrations, "accounts_missing", return_value=["accounts.Ledger"]):
        r = client_for(admin).post(f"{BASE}/{lead.id}/finalize", {"amount": "100"})
    assert r.status_code == 409 and err(r) == "accounts_not_ready"
    assert r.json()["error"]["details"]["missing"]


def test_finalize_creates_a_finalized_ledger(client_for, admin, make_lead):
    lead = make_lead(status=LeadStatus.WON, proposed_amount=100)
    r = client_for(admin).post(f"{BASE}/{lead.id}/finalize", {"amount": "100"})
    assert r.status_code == 200
    from apps.accounts.models import Ledger

    assert Ledger.objects.get(lead=lead).finalized_at is not None


def test_finalize_needs_a_won_lead(client_for, admin, make_lead):
    lead = make_lead(status=LeadStatus.CONTACTED)
    r = client_for(admin).post(f"{BASE}/{lead.id}/finalize", {"amount": "100"})
    assert err(r) == "not_won"


def test_soft_delete(client_for, admin, make_lead):
    lead = make_lead()
    c = client_for(admin)
    assert c.delete(f"{BASE}/{lead.id}").status_code == 204
    assert c.get(f"{BASE}/{lead.id}").status_code == 404
    assert Lead.all_objects.get(pk=lead.id).is_deleted


def test_whatsapp_renders_logs_and_contacts(client_for, exec_a, make_lead):
    lead = make_lead(assigned_to=exec_a, name="Rahul Sharma", phone="+919876543210")
    template = WhatsAppTemplate.objects.get(name="Welcome / Intro")
    c = client_for(exec_a)
    assert template.id in [t["id"] for t in c.get(f"{BASE}/whatsapp-templates").json()]
    r = c.post(f"{BASE}/{lead.id}/whatsapp", {"template_id": template.id})
    assert r.status_code == 200
    data = r.json()
    assert data["text"].startswith("Hi Rahul Sharma, this is ")
    assert "ARQUS Sports Consultancy" in data["text"]
    assert data["url"].startswith("https://wa.me/919876543210?text=Hi%20Rahul%20Sharma")
    lead.refresh_from_db()
    assert lead.status == LeadStatus.CONTACTED
    assert lead.messages.get().status == "OPENED"


# ---- Filters, ordering, pagination ----------


def _ids(response):
    return [row["id"] for row in response.json()["results"]]


def test_followup_filters_in_ist(client_for, manager, make_lead):
    now = timezone.now()
    today_ist = now.astimezone(IST).date()
    end_of_day = datetime.combine(today_ist + timedelta(days=1), datetime.min.time(), tzinfo=IST)
    overdue = make_lead(next_followup_at=now - timedelta(hours=1))
    today = make_lead(
        next_followup_at=max(now + timedelta(minutes=1), end_of_day - timedelta(minutes=1))
    )
    upcoming = make_lead(next_followup_at=end_of_day + timedelta(minutes=1))
    none = make_lead()
    make_lead(status=LeadStatus.WON, proposed_amount=1)  # closed: in no bucket
    c = client_for(manager)
    assert _ids(c.get(f"{BASE}?followup=overdue")) == [overdue.id]
    assert _ids(c.get(f"{BASE}?followup=today")) == [today.id]
    assert _ids(c.get(f"{BASE}?followup=upcoming")) == [upcoming.id]
    assert _ids(c.get(f"{BASE}?followup=none")) == [none.id]
    summary = c.get(f"{BASE}/summary").json()
    assert (summary["overdue"], summary["today"], summary["no_followup"]) == (1, 1, 1)


def test_open_untouched_won_awaiting(client_for, manager, make_lead):
    untouched = make_lead()
    touched = make_lead()
    Interaction.objects.create(lead=touched, type="NOTE")
    won = make_lead(status=LeadStatus.WON, proposed_amount=5)
    make_lead(status=LeadStatus.LOST, lost_reason="PRICE")
    c = client_for(manager)
    assert set(_ids(c.get(f"{BASE}?open=true"))) == {untouched.id, touched.id}
    assert _ids(c.get(f"{BASE}?untouched=true")) == [untouched.id]
    assert _ids(c.get(f"{BASE}?won_awaiting=true")) == [won.id]
    by_status = {s["status"]: s for s in c.get(f"{BASE}/summary").json()["by_status"]}
    assert by_status["WON"] == {"status": "WON", "count": 1, "value": "5.00"}


def test_search_status_and_ordering(client_for, manager, make_lead, future):
    a = make_lead(name="Asha", phone="+919811111111", next_followup_at=future)
    b = make_lead(name="Bharat", email="bharat@x.com", status=LeadStatus.CONTACTED)
    c_ = make_lead(
        name="Chetan", status=LeadStatus.INTERESTED, next_followup_at=future - timedelta(hours=1)
    )
    c = client_for(manager)
    assert _ids(c.get(f"{BASE}?q=98111")) == [a.id]
    assert _ids(c.get(f"{BASE}?q=bharat@")) == [b.id]
    assert set(_ids(c.get(f"{BASE}?status=contacted,interested"))) == {b.id, c_.id}
    assert _ids(c.get(f"{BASE}?ordering=name")) == [a.id, b.id, c_.id]
    assert _ids(c.get(f"{BASE}?ordering=next_followup_at")) == [c_.id, a.id, b.id]  # nulls last


def test_pagination(client_for, manager, make_lead):
    for _ in range(25):
        make_lead()
    data = client_for(manager).get(f"{BASE}?page=2").json()
    assert data["count"] == 25 and len(data["results"]) == 5
    assert len(client_for(manager).get(f"{BASE}?page_size=500").json()["results"]) == 25


def test_list_query_budget(client_for, manager, exec_a, make_lead):
    for i in range(20):
        lead = make_lead(assigned_to=exec_a if i % 2 else None)
        Interaction.objects.create(lead=lead, type="NOTE")
    c = client_for(manager)
    with CaptureQueriesContext(connection) as ctx:
        assert c.get(BASE).status_code == 200
    assert len(ctx.captured_queries) < 8


# ---- CSV ----------


def test_csv_is_scoped_filtered_and_safe(client_for, manager, make_lead):
    make_lead(name="=HYPERLINK(1)", status=LeadStatus.CONTACTED)
    make_lead(name="Plain", status=LeadStatus.NEW)
    r = client_for(manager).get(f"{BASE}/export?status=CONTACTED")
    body = b"".join(r.streaming_content).decode("utf-8-sig")
    lines = body.strip().splitlines()
    assert lines[0].startswith("Name,Phone")
    assert len(lines) == 2 and lines[1].startswith("'=HYPERLINK(1)")
    assert ",'+9197" in lines[1]


def test_whatsapp_preview_logs_nothing(client_for, exec_a, make_lead):
    lead = make_lead(assigned_to=exec_a, name="Asha")
    template = WhatsAppTemplate.objects.get(name="Follow-up")
    r = client_for(exec_a).get(f"{BASE}/{lead.id}/whatsapp?template_id={template.id}")
    assert r.status_code == 200 and r.json()["text"].startswith("Hi Asha,")
    assert not lead.messages.exists() and not lead.interactions.exists()
    lead.refresh_from_db()
    assert lead.status == LeadStatus.NEW


def test_list_rows_carry_role_aware_transitions(client_for, exec_a, manager, make_lead):
    make_lead(assigned_to=exec_a, status=LeadStatus.LOST, lost_reason="PRICE")
    row = client_for(exec_a).get(BASE).json()["results"][0]
    assert row["allowed_transitions"] == []
    row = client_for(manager).get(BASE).json()["results"][0]
    assert row["allowed_transitions"] == ["CONTACTED"]


def test_admin_can_own_work_and_close_a_lead(client_for, admin, make_lead):
    lead = make_lead()
    c = client_for(admin)
    r = c.post(f"{BASE}/{lead.id}/assign", {"assigned_to": admin.id})
    assert r.status_code == 200 and r.json()["assigned_to"]["id"] == admin.id
    assert admin.id in [a["id"] for a in c.get(f"{BASE}/assignees").json()]
    c.post(f"{BASE}/{lead.id}/interactions", {"type": "CALL", "notes": "Spoke"})
    r = c.post(f"{BASE}/{lead.id}/status", {"status": "WON", "proposed_amount": "500000"})
    assert r.status_code == 200 and r.json()["status"] == "WON"
    r = c.post(f"{BASE}/{lead.id}/finalize", {"amount": "500000"})
    assert r.status_code == 200 and r.json()["finance"]["finalized"] is True


def test_interested_cannot_go_back_to_contacted(client_for, manager, make_lead):
    lead = make_lead(status=LeadStatus.INTERESTED)
    data = client_for(manager).get(f"{BASE}/{lead.id}").json()
    assert data["allowed_transitions"] == ["WON", "LOST"]


def test_won_can_still_be_lost_by_managers_only_before_payment(
    client_for, manager, exec_a, make_lead
):
    lead = make_lead(status=LeadStatus.WON, assigned_to=exec_a, proposed_amount=900)
    assert client_for(exec_a).get(f"{BASE}/{lead.id}").json()["allowed_transitions"] == []
    assert client_for(manager).get(f"{BASE}/{lead.id}").json()["allowed_transitions"] == ["LOST"]
    r = client_for(exec_a).post(
        f"{BASE}/{lead.id}/status", {"status": "LOST", "lost_reason": "PRICE"}
    )
    assert err(r) == "invalid_transition"

    with mock.patch.object(integrations, "payments_received", return_value=True):
        r = client_for(manager).post(
            f"{BASE}/{lead.id}/status", {"status": "LOST", "lost_reason": "PRICE"}
        )
    assert r.status_code == 409 and err(r) == "has_payments"
    lead.refresh_from_db()
    assert lead.status == LeadStatus.WON

    with (
        mock.patch.object(integrations, "cancel_ledger") as cancel,
        mock.patch.object(integrations, "_notify") as notify,
    ):
        r = client_for(manager).post(
            f"{BASE}/{lead.id}/status", {"status": "LOST", "lost_reason": "PRICE"}
        )
    assert r.status_code == 200 and r.json()["status"] == "LOST" and r.json()["won_at"] is None
    cancel.assert_called_once()
    assert notify.call_count == 0 or all(
        c.args[1] == "lead_won_reversed" for c in notify.call_args_list
    )


def test_finalized_flag_is_for_managers_only(client_for, manager, exec_a, make_lead):
    make_lead(status=LeadStatus.WON, assigned_to=exec_a, proposed_amount=5)
    assert client_for(manager).get(BASE).json()["results"][0]["finalized"] is False
    assert "finalized" not in client_for(exec_a).get(BASE).json()["results"][0]
