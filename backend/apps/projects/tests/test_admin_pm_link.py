"""The admin dashboard and the PM dashboard describe the same projects the same way.

Only the admin side has a budget (the deal total); the PM side only has expenses so far.
"""

from decimal import Decimal

from apps.projects import selectors, services

from .conftest import BASE, expense_form

ADMIN_DASH = "/api/v1/dashboard/admin"
PM_DASH = "/api/v1/dashboard/pm"


def test_admin_dashboard_reflects_what_the_pm_logs(client_for, admin, pm1, make_project):
    project = make_project(pm=pm1, budget="100000.00", name="Sharma Farmhouse Turf")
    a, p = client_for(admin), client_for(pm1)
    assert a.get(ADMIN_DASH).json()["kpis"]["projects_running"] == 1

    for amount in ("50000", "30000"):
        made = p.post(
            f"{BASE}/{project.pk}/expenses", expense_form(amount=amount), format="multipart"
        )
        assert made.status_code == 201
    admin_body = a.get(ADMIN_DASH).json()
    pm_body = p.get(PM_DASH).json()

    assert Decimal(admin_body["kpis"]["spent"]) == Decimal("80000.00")
    assert admin_body["kpis"]["spent"] == pm_body["kpis"]["total_spent"]
    burn = admin_body["projects_burn"][0]
    row = pm_body["projects"][0]
    assert burn["spent"] == row["spent"] == "80000.00"
    assert burn["total_budget"] == "100000.00" and burn["state"] == "warn"
    assert float(burn["pct"]) == 80.0
    assert burn["pm"] == pm1.display_name  # tells apart projects that share a name
    assert "state" not in row and "total_budget" not in row  # the PM never sees a budget
    assert admin_body["attention"] == []  # budget alerts no longer exist
    assert admin_body["recent"]["expenses"][0]["project"] == "Sharma Farmhouse Turf"
    assert admin_body["recent"]["activity"][0]["type"] == "expense"


def test_exactly_100_percent_of_the_deal_total_is_warn_for_the_admin(
    client_for, admin, pm1, make_project
):
    project = make_project(pm=pm1, budget="100000.00")
    services.add_expense(
        project.pk,
        pm1,
        {
            "amount": Decimal("100000.00"),
            "category": "LABOUR",
            "spent_on": selectors.business_today(),
        },
    )
    assert client_for(admin).get(ADMIN_DASH).json()["projects_burn"][0]["state"] == "warn"
    assert client_for(admin).get(f"{BASE}/{project.pk}").json()["remaining"] == "0.00"


def test_completing_moves_the_project_on_both_dashboards(client_for, admin, pm1, make_project):
    project = make_project(pm=pm1)
    assert client_for(pm1).post(f"{BASE}/{project.pk}/complete").status_code == 200
    kpis = client_for(admin).get(ADMIN_DASH).json()
    assert kpis["kpis"]["projects_running"] == 0 and kpis["kpis"]["projects_completed"] == 1
    assert kpis["projects_burn"] == []
    assert client_for(pm1).get(PM_DASH).json()["kpis"]["projects_completed"] == 1
    assert kpis["recent"]["activity"][0]["action"].startswith("project completed")
