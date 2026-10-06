"""Sales Manager: a read-only Projects view with every money figure hidden (a leak test, like the
Project Manager's privacy shield but for a different field set), plus a PM expense regression."""

from decimal import Decimal

from .conftest import BASE, EXPENSES, expense_form

#: Key fragments that must never appear in any Sales Manager project response, at any depth.
FORBIDDEN = ("budget", "remaining", "usage", "margin", "finance", "amount")
#: Whole keys: `spent` / `spent_total` are money (`spent_on`, an expense's date, is not).
FORBIDDEN_EXACT = ("spent", "spent_total", "received", "outstanding")


def money_keys(payload, path="$") -> list[str]:
    """Every key, at any depth, that carries a money figure."""
    found = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            k = str(key).lower()
            if any(bad in k for bad in FORBIDDEN) or k in FORBIDDEN_EXACT:
                found.append(f"{path}.{key}")
            found += money_keys(value, f"{path}.{key}")
    elif isinstance(payload, list):
        for i, item in enumerate(payload):
            found += money_keys(item, f"{path}[{i}]")
    return found


def test_money_keys_finds_nested_keys():
    assert money_keys({"a": [{"x": {"spent_total": 1}}]}) == ["$.a[0].x.spent_total"]
    assert money_keys({"spent_on": "2026-09-01", "sanctioned_budget": None}) == [
        "$.sanctioned_budget"
    ]
    assert money_keys([{"amount": "1"}, {"live_margin": None}]) == [
        "$[0].amount",
        "$[1].live_margin",
    ]


def _project_money(payload) -> list[str]:
    """Money keys other than an expense's own `amount` (the sales manager sees those)."""
    return [k for k in money_keys(payload) if not k.endswith(".amount")]


def test_sales_manager_project_responses_carry_no_project_money(
    client_for, sales_manager, pm1, make_project, make_expense
):
    running = make_project(pm=pm1, budget="777000.00")
    make_expense(pm1, "4321.00", proj=running)
    done = make_project(pm=pm1)
    make_expense(pm1, "999.00", proj=done)
    client_for(pm1).post(f"{BASE}/{done.pk}/complete")
    c = client_for(sales_manager)
    urls = [
        BASE,
        f"{BASE}?status=RUNNING",
        f"{BASE}?status=COMPLETED",
        f"{BASE}?ordering=-spent",
        f"{BASE}/summary",
        f"{BASE}/summary?status=COMPLETED",
        f"{BASE}/{running.pk}",
        f"{BASE}/{done.pk}",
        f"{BASE}/{running.pk}/events",
        f"{BASE}/{running.pk}/expenses",
        EXPENSES,
        f"{EXPENSES}?project={running.pk}",
    ]
    for url in urls:
        res = c.get(url)
        assert res.status_code == 200, url
        assert _project_money(res.json()) == [], (url, _project_money(res.json()))
        assert "777000" not in res.content.decode(), url  # the deal total / budget never shows


def test_sales_manager_sees_the_pms_and_their_own_expenses_but_never_the_admins(
    client_for, sales_manager, admin, pm1, project, make_expense
):
    pm_exp = make_expense(pm1, "50.00", vendor="Shree Traders")  # the PM's: visible
    admin_exp = make_expense(admin, "70.00")  # the admin's: hidden
    c = client_for(sales_manager)
    mine = c.post(
        f"{BASE}/{project.pk}/expenses",
        expense_form(amount="123.45", vendor="My vendor"),
        format="multipart",
    )
    assert mine.status_code == 201
    body = c.get(f"{BASE}/{project.pk}").json()
    assert body["client_name"] and body["pm_name"] == pm1.display_name
    assert body["lead_id"] == project.opportunity.lead_id  # links back to the lead profile
    assert body["allowed_actions"] == ["add_expense"]  # the only action: log an expense
    seen = {e["id"]: e for e in body["expenses"]}
    assert set(seen) == {pm_exp.pk, mine.json()["id"]}
    assert seen[pm_exp.pk]["amount"] == "50.00" and seen[pm_exp.pk]["vendor"] == "Shree Traders"
    assert seen[mine.json()["id"]]["amount"] == "123.45"
    assert all(e["has_receipt"] and "spent_on" in e for e in seen.values())
    for exp_id in seen:
        assert c.get(f"{EXPENSES}/{exp_id}/receipt").status_code == 200
    # The list endpoints agree, and the admin's expense does not exist for them.
    assert {r["id"] for r in c.get(EXPENSES).json()["results"]} == set(seen)
    assert {r["id"] for r in c.get(f"{BASE}/{project.pk}/expenses").json()["results"]} == set(seen)
    assert c.get(f"{EXPENSES}/{admin_exp.pk}").status_code == 404
    assert c.get(f"{EXPENSES}/{admin_exp.pk}/receipt").status_code == 404


def test_sales_manager_timeline_shows_the_pms_and_their_own_expenses_not_the_admins(
    client_for, sales_manager, admin, pm1, project, make_expense
):
    pm_exp = make_expense(pm1, "50.00")
    admin_exp = make_expense(admin, "70.00")
    c = client_for(sales_manager)
    own = c.post(
        f"{BASE}/{project.pk}/expenses", expense_form(amount="9.00"), format="multipart"
    ).json()["id"]
    events = c.get(f"{BASE}/{project.pk}/events").json()["results"]
    added = {e["data"]["expense_id"]: e for e in events if e["type"] == "EXPENSE_ADDED"}
    assert set(added) == {pm_exp.pk, own} and admin_exp.pk not in added
    assert added[pm_exp.pk]["data"]["amount"] == "50.00"  # amounts show for what they may see
    assert added[own]["data"]["amount"] == "9.00"
    assert "spent" not in str(events)  # project spend stays hidden
    assert any(e["type"] == "CREATED" for e in events)


def test_sales_manager_list_rows_have_the_basics(client_for, sales_manager, pm1, project):
    (row,) = client_for(sales_manager).get(BASE).json()["results"]
    assert set(row) == {
        "id", "name", "client_name", "lead_id", "status", "start_date", "expected_end_date",
        "completed_at", "created_at", "pm_name", "project_no",
    }  # fmt: skip


def test_pm_still_logs_expenses_and_the_amount_deducts(client_for, admin, pm1, make_project):
    """Regression: the Project Manager's expense flow is unchanged by the Opportunity refactor."""
    project = make_project(pm=pm1, budget="100000.00")
    before = client_for(admin).get(f"{BASE}/{project.pk}").json()
    assert before["remaining"] == "100000.00" and before["spent"] == "0.00"
    res = client_for(pm1).post(
        f"{BASE}/{project.pk}/expenses", expense_form(amount="12500.50"), format="multipart"
    )
    assert res.status_code == 201, res.content
    assert res.json()["amount"] == "12500.50"
    pm_view = client_for(pm1).get(f"{BASE}/{project.pk}").json()
    assert pm_view["spent"] == "12500.50"
    after = client_for(admin).get(f"{BASE}/{project.pk}").json()
    assert after["spent"] == "12500.50"
    assert Decimal(after["remaining"]) == Decimal("100000.00") - Decimal("12500.50")
    assert client_for(pm1).get(f"{EXPENSES}?project={project.pk}").json()["count"] == 1
