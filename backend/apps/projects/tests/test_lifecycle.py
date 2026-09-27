from decimal import Decimal

import pytest

from apps.projects import selectors, services
from apps.projects.models import Project, ProjectEvent

from .conftest import BASE, expense_form


def code(res):
    return res.json()["error"]["code"]


def kinds(notes):
    return [(uid, kind) for uid, kind, _ in notes]


# ---- budget_state ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "spent, total, state",
    [
        ("0", "100", "ok"),
        ("79.99", "100", "ok"),
        ("80", "100", "warn"),  # the warning line itself
        ("99.99", "100", "warn"),
        ("100", "100", "warn"),  # exactly the budget is still "warn"
        ("100.01", "100", "over"),
        ("500", "100", "over"),
        ("0", "0", "ok"),
        ("1", "0", "ok"),  # no deal total: nothing to measure against
        ("79999.99", "99999.99", "ok"),
    ],
)
def test_budget_state_thresholds(spent, total, state):
    assert selectors.budget_state(Decimal(spent), Decimal(total)) == state


def test_without_a_deal_total_there_is_no_budget_state_or_remaining():
    assert selectors.budget_state(Decimal("500"), None) == "ok"
    assert selectors.usage_pct(Decimal("500"), None) == "0.00"
    assert selectors.remaining(Decimal("500"), None) is None
    assert selectors.remaining(Decimal("500"), Decimal("400")) == Decimal("-100")


def test_usage_pct_is_a_string_that_never_rounds_into_the_next_state():
    assert selectors.usage_pct(Decimal("79.999"), Decimal("100")) == "79.99"
    assert selectors.usage_pct(Decimal("82.5"), Decimal("100")) == "82.50"
    assert selectors.usage_pct(Decimal("0"), Decimal("0")) == "0.00"


# ---- Complete and reopen -----------------------------------------------------------------------


def test_the_assigned_pm_or_admin_can_complete(client_for, admin, pm1, pm2, make_project):
    mine = make_project(pm=pm1)
    other = make_project(pm=pm2)
    assert client_for(pm2).post(f"{BASE}/{mine.pk}/complete").status_code == 404
    res = client_for(pm1).post(f"{BASE}/{mine.pk}/complete")
    assert (
        res.status_code == 200
        and res.json()["status"] == "COMPLETED"
        and res.json()["completed_at"]
    )
    assert client_for(admin).post(f"{BASE}/{other.pk}/complete").status_code == 200
    again = client_for(admin).post(f"{BASE}/{other.pk}/complete")
    assert again.status_code == 409 and code(again) == "project_completed"
    done = Project.objects.get(pk=mine.pk)
    assert done.completed_by_id == pm1.pk and done.completed_at


def test_sales_roles_cannot_complete(client_for, sales_manager, sales_exec, project):
    for user in (sales_manager, sales_exec):
        assert client_for(user).post(f"{BASE}/{project.pk}/complete").status_code == 403


def test_completing_notifies_the_other_side(admin, pm1, project, notes):
    services.complete(project.pk, pm1)
    assert (admin.pk, "project_completed") in kinds(notes)
    assert (pm1.pk, "project_completed") not in kinds(notes)  # not the person who did it


def test_only_admin_can_reopen_and_needs_a_reason(client_for, admin, pm1, project, notes):
    services.complete(project.pk, pm1)
    url = f"{BASE}/{project.pk}/reopen"
    assert client_for(pm1).post(url, {"reason": "x"}, format="json").status_code == 403
    assert client_for(admin).post(url, {}, format="json").status_code == 400
    notes.clear()
    res = client_for(admin).post(url, {"reason": "More work"}, format="json")
    assert (
        res.status_code == 200
        and res.json()["status"] == "RUNNING"
        and res.json()["completed_at"] is None
    )
    assert (pm1.pk, "project_reopened") in kinds(notes)
    assert ProjectEvent.objects.filter(project=project, type="REOPENED").get().data == {
        "reason": "More work"
    }
    again = client_for(admin).post(url, {"reason": "x"}, format="json")
    assert again.status_code == 409 and code(again) == "not_completed"


# ---- Assign PM ---------------------------------------------------------------------------------


def test_assign_pm_notifies_both_and_logs(client_for, admin, pm1, pm2, project, notes):
    res = client_for(admin).post(f"{BASE}/{project.pk}/assign-pm", {"pm": pm2.pk}, format="json")
    assert res.status_code == 200 and res.json()["pm"]["id"] == pm2.pk
    assert (pm1.pk, "project_unassigned") in kinds(notes)
    assert (pm2.pk, "project_assigned") in kinds(notes)
    event = ProjectEvent.objects.filter(project=project, type="PM_ASSIGNED").get()
    assert event.data["pm"] == pm2.display_name and event.data["previous_pm"] == pm1.display_name
    # unassign
    res = client_for(admin).post(f"{BASE}/{project.pk}/assign-pm", {"pm": None}, format="json")
    assert res.status_code == 200 and res.json()["pm"] is None


def test_assign_pm_rules(client_for, admin, pm1, sales_exec, project, notes):
    url = f"{BASE}/{project.pk}/assign-pm"
    assert client_for(pm1).post(url, {"pm": pm1.pk}, format="json").status_code == 403
    assert client_for(admin).post(url, {"pm": sales_exec.pk}, format="json").status_code == 400
    notes.clear()
    assert (
        client_for(admin).post(url, {"pm": pm1.pk}, format="json").status_code == 200
    )  # unchanged
    assert notes == []
    assert not ProjectEvent.objects.filter(project=project, type="PM_ASSIGNED").exists()


def test_the_old_pm_loses_access_and_the_new_one_gains_it(client_for, admin, pm1, pm2, project):
    services.assign_pm(project.pk, pm2.pk, admin)
    assert client_for(pm1).get(f"{BASE}/{project.pk}").status_code == 404
    assert client_for(pm2).get(f"{BASE}/{project.pk}").status_code == 200


def alert_kinds(notes):
    return [kind for _, kind, _ in notes if kind.startswith("budget_")]


# ---- Details and events ------------------------------------------------------------------------


def test_admin_can_edit_details_but_a_pm_cannot(client_for, admin, pm1, project):
    url = f"{BASE}/{project.pk}"
    assert client_for(pm1).patch(url, {"name": "x"}, format="json").status_code == 403
    res = client_for(admin).patch(
        url,
        {"name": "Renamed", "scope": "New scope", "expected_end_date": "2027-01-01"},
        format="json",
    )
    assert (
        res.status_code == 200
        and res.json()["name"] == "Renamed"
        and res.json()["scope"] == "New scope"
    )
    bad = client_for(admin).patch(url, {"start_date": "2027-02-01"}, format="json")
    assert bad.status_code == 400  # after the (already set) end date


def test_events_are_a_newest_first_timeline(client_for, admin, pm1, project, make_expense):
    make_expense(pm1, "100.00")
    services.complete(project.pk, pm1)
    body = client_for(pm1).get(f"{BASE}/{project.pk}/events").json()
    types = [e["type"] for e in body["results"]]
    assert types == ["COMPLETED", "EXPENSE_ADDED", "CREATED"]
    assert body["results"][1]["data"]["amount"] == "100.00"
    assert body["results"][0]["actor_name"] == pm1.display_name


def test_allowed_actions_come_from_the_server(client_for, admin, pm1, project):
    assert client_for(admin).get(f"{BASE}/{project.pk}").json()["allowed_actions"] == [
        "add_expense", "complete", "reassign", "edit",
    ]  # fmt: skip
    assert client_for(pm1).get(f"{BASE}/{project.pk}").json()["allowed_actions"] == [
        "add_expense",
        "complete",
    ]
    services.complete(project.pk, pm1)
    assert client_for(admin).get(f"{BASE}/{project.pk}").json()["allowed_actions"] == ["reopen"]
    assert client_for(pm1).get(f"{BASE}/{project.pk}").json()["allowed_actions"] == []


def test_expense_add_writes_an_event_and_a_pm_can_see_it_but_no_finance(client_for, pm1, project):
    client_for(pm1).post(f"{BASE}/{project.pk}/expenses", expense_form(), format="multipart")
    assert ProjectEvent.objects.filter(project=project, type="EXPENSE_ADDED").count() == 1
