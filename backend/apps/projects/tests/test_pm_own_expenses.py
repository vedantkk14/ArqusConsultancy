"""A project manager sees only the expenses they logged, never the admin's or the sales manager's.
The admin sees everything, with who added each one and their role."""

from .conftest import BASE, EXPENSES, expense_form


def _add(client, project, amount, category="MATERIALS"):
    res = client.post(
        f"{BASE}/{project.pk}/expenses",
        expense_form(amount=amount, category=category, receipt=None),
        format="multipart",
    )
    assert res.status_code == 201, res.content
    return res.json()["id"]


def _world(client_for, admin, pm1, sales_manager, project):
    return {
        "pm": _add(client_for(pm1), project, "100.00"),
        "admin": _add(client_for(admin), project, "200.00", "LABOUR"),
        "sm": _add(client_for(sales_manager), project, "300.00", "FOOD"),
    }


def test_a_pm_only_sees_their_own_expenses(client_for, admin, pm1, sales_manager, project):
    ids = _world(client_for, admin, pm1, sales_manager, project)
    pm = client_for(pm1)
    project_rows = pm.get(f"{BASE}/{project.pk}/expenses").json()["results"]
    assert [r["id"] for r in project_rows] == [ids["pm"]]
    assert [r["id"] for r in pm.get(EXPENSES).json()["results"]] == [ids["pm"]]
    for other in (ids["admin"], ids["sm"]):
        assert pm.get(f"{EXPENSES}/{other}").status_code == 404
    assert pm.get(f"{EXPENSES}/{ids['pm']}").status_code == 200


def test_a_pms_totals_count_only_their_own_expenses(
    client_for, admin, pm1, sales_manager, project
):
    _world(client_for, admin, pm1, sales_manager, project)
    pm = client_for(pm1)
    assert pm.get(f"{BASE}/{project.pk}").json()["spent"] == "100.00"
    listed = {r["id"]: r for r in pm.get(BASE).json()["results"]}
    assert listed[project.pk]["spent"] == "100.00"
    dash = pm.get("/api/v1/dashboard/pm").json()
    assert dash["kpis"]["total_spent"] == "100.00"
    assert [e["amount"] for e in dash["recent_expenses"]] == ["100.00"]
    # The admin still sees the true total.
    assert client_for(admin).get(f"{BASE}/{project.pk}").json()["spent"] == "600.00"


def test_a_pms_timeline_only_shows_expenses_they_added(
    client_for, admin, pm1, sales_manager, project
):
    ids = _world(client_for, admin, pm1, sales_manager, project)
    client_for(admin).post(f"{EXPENSES}/{ids['pm']}/void", {"reason": "typo"}, format="json")
    pm_events = client_for(pm1).get(f"{BASE}/{project.pk}/events").json()["results"]
    expense_events = [e for e in pm_events if e["type"].startswith("EXPENSE_")]
    assert {e["data"]["expense_id"] for e in expense_events} == {ids["pm"]}
    kinds = {e["type"] for e in expense_events}
    assert kinds == {"EXPENSE_ADDED", "EXPENSE_VOIDED"}  # their own, even when the admin voided it
    assert all(e["type"] != "EXPENSE_ADDED" or e["actor_name"] for e in expense_events)
    # Other timeline entries (created, PM assigned...) are still there.
    assert any(e["type"] == "CREATED" for e in pm_events)
    # The admin's timeline has everyone's.
    admin_events = client_for(admin).get(f"{BASE}/{project.pk}/events").json()["results"]
    assert {e["data"]["expense_id"] for e in admin_events if e["type"] == "EXPENSE_ADDED"} == set(
        ids.values()
    )


def test_the_admin_sees_every_expense_and_who_added_it_with_their_role(
    client_for, admin, pm1, sales_manager, project
):
    ids = _world(client_for, admin, pm1, sales_manager, project)
    rows = client_for(admin).get(f"{BASE}/{project.pk}/expenses").json()["results"]
    who = {r["id"]: r["logged_by"] for r in rows}
    assert set(who) == set(ids.values())
    assert who[ids["pm"]]["role"] == "Project Manager"
    assert who[ids["admin"]]["role"] == "Admin"
    assert who[ids["sm"]]["role"] == "Sales Manager"
    assert who[ids["pm"]]["name"]
