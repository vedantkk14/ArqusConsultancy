from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.projects import selectors, services
from apps.projects.models import Expense

from .conftest import BASE, EXPENSES, days_ago, expense_form, receipt_file


def add(client, project, **over):
    return client.post(f"{BASE}/{project.pk}/expenses", expense_form(**over), format="multipart")


def code(res):
    return res.json()["error"]["code"]


# ---- Amount ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "amount",
    ["0", "0.00", "-1", "-0.01", "1.234", "12345678901", "abc", "1e3", "", " ", "1,000", "NaN"],
)
def test_amount_validation_rejects(client_for, pm1, project, amount):
    res = add(client_for(pm1), project, amount=amount)
    assert res.status_code == 400, amount
    assert "amount" in res.json()["error"]["details"]
    assert not Expense.objects.exists()


@pytest.mark.parametrize(
    "amount, stored", [("1", "1.00"), ("0.01", "0.01"), ("1234567890.99", "1234567890.99")]
)
def test_amount_validation_accepts_up_to_ten_digits_and_two_decimals(
    client_for, admin, make_project, amount, stored
):
    project = make_project(budget="1000000.00")
    res = add(
        client_for(admin), project, amount=amount, admin_override="true", override_reason="test"
    )
    assert res.status_code in (201, 409)
    if res.status_code == 201:
        assert res.json()["amount"] == stored


def test_amount_rejects_json_floats_but_takes_strings(client_for, pm1, project):
    client = client_for(pm1)
    body = {"category": "LABOUR", "spent_on": selectors.business_today().isoformat()}
    assert (
        client.post(
            f"{BASE}/{project.pk}/expenses", {**body, "amount": 12.5}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"{BASE}/{project.pk}/expenses", {**body, "amount": True}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"{BASE}/{project.pk}/expenses", {**body, "amount": "12.50"}, format="json"
        ).status_code
        == 201
    )


def test_money_is_stored_and_returned_as_decimal_strings(client_for, pm1, project):
    res = add(client_for(pm1), project, amount="1234.5")
    assert res.json()["amount"] == "1234.50"
    assert Expense.objects.get().amount == Decimal("1234.50")


# ---- Dates -------------------------------------------------------------------------------------


def test_date_rules(client_for, pm1, project):
    client = client_for(pm1)
    today = selectors.business_today()
    assert add(client, project, spent_on=today.isoformat()).status_code == 201
    assert (
        add(client, project, spent_on=days_ago(30).isoformat()).status_code == 201
    )  # the limit itself
    for bad in (today + timedelta(days=1), days_ago(31), "2026-13-45", "not a date"):
        res = add(client, project, spent_on=str(bad))
        assert res.status_code == 400, bad
        assert "spent_on" in res.json()["error"]["details"]


def test_the_date_is_the_business_date_not_utc(client_for, pm1, project, settings):
    """At 23:00 UTC it is already tomorrow in Asia/Kolkata: that date must be accepted."""
    settings.BUSINESS_TIME_ZONE = "Asia/Kolkata"
    now = timezone.now().replace(hour=23, minute=0)
    ist_today = selectors.business_today(now)
    assert ist_today == (now + timedelta(hours=5, minutes=30)).date()


# ---- Category, text, receipts ------------------------------------------------------------------


def test_category_is_one_of_the_seven(client_for, pm1, project):
    client = client_for(pm1)
    for category in ("MATERIALS", "LABOUR", "TRANSPORT", "EQUIPMENT", "FOOD", "PERMITS", "OTHER"):
        assert add(client, project, category=category, amount="1").status_code == 201, category
    assert add(client, project, category="MISC").status_code == 400


def test_description_is_limited_to_500_characters(client_for, pm1, project):
    client = client_for(pm1)
    assert add(client, project, description="x" * 500).status_code == 201
    assert add(client, project, description="x" * 501).status_code == 400


def test_receipt_is_required_except_for_labour(client_for, pm1, project):
    client = client_for(pm1)
    res = add(client, project, receipt=None)
    assert res.status_code == 400 and "receipt" in res.json()["error"]["details"]
    assert add(client, project, category="LABOUR", receipt=None, amount="10").status_code == 201


# ---- Budget rule -------------------------------------------------------------------------------


def test_an_expense_of_exactly_the_remaining_budget_is_allowed(
    client_for, pm1, make_project, notes
):
    project = make_project(pm=pm1, budget="1000.00")
    client = client_for(pm1)
    assert add(client, project, amount="400.00").status_code == 201
    res = add(client, project, amount="600.00")  # exactly what is left
    assert res.status_code == 201
    body = client.get(f"{BASE}/{project.pk}").json()
    assert body["state"] == "warn" and body["remaining"] == "0.00" and body["usage_pct"] == "100.00"


def test_over_budget_is_refused_with_the_remaining_amount(client_for, pm1, make_project):
    project = make_project(pm=pm1, budget="1000.00")
    client = client_for(pm1)
    add(client, project, amount="900.00")
    res = add(client, project, amount="100.01")
    assert res.status_code == 409 and code(res) == "over_budget"
    assert res.json()["error"]["details"] == {"remaining": "100.00"}
    assert Expense.objects.count() == 1


def test_two_sequential_expenses_that_together_exceed_the_budget_block_the_second(
    client_for, pm1, make_project
):
    project = make_project(pm=pm1, budget="1000.00")
    client = client_for(pm1)
    assert add(client, project, amount="600.00").status_code == 201
    assert code(add(client, project, amount="600.00")) == "over_budget"


def test_pm_cannot_override_the_budget(client_for, pm1, make_project):
    project = make_project(pm=pm1, budget="100.00")
    res = add(
        client_for(pm1), project, amount="500.00", admin_override="true", override_reason="please"
    )
    assert res.status_code == 409 and code(res) == "over_budget"
    assert not Expense.objects.exists()


def test_admin_override_needs_a_reason_and_is_flagged(client_for, admin, make_project):
    project = make_project(budget="100.00")
    client = client_for(admin)
    assert code(add(client, project, amount="500.00")) == "over_budget"  # no override asked
    no_reason = add(client, project, amount="500.00", admin_override="true")
    assert (
        no_reason.status_code == 400 and "override_reason" in no_reason.json()["error"]["details"]
    )
    res = add(
        client,
        project,
        amount="500.00",
        admin_override="true",
        override_reason="Client asked for more",
    )
    assert res.status_code == 201
    assert (
        res.json()["is_override"] is True
        and res.json()["override_reason"] == "Client asked for more"
    )
    body = client.get(f"{BASE}/{project.pk}").json()
    assert body["state"] == "over" and body["remaining"] == "-400.00"


def test_the_override_flag_is_only_set_when_it_was_needed(client_for, admin, make_project):
    project = make_project(budget="1000.00")
    res = add(
        client_for(admin),
        project,
        amount="10.00",
        admin_override="true",
        override_reason="not needed",
    )
    assert res.status_code == 201 and res.json()["is_override"] is False


def test_only_running_projects_accept_expenses(client_for, pm1, project):
    client = client_for(pm1)
    client.post(f"{BASE}/{project.pk}/complete")
    res = add(client, project)
    assert res.status_code == 409 and code(res) == "project_completed"


def test_pm_can_only_add_to_their_own_projects_and_sales_roles_never(
    client_for, pm2, sales_manager, sales_exec, project
):
    assert add(client_for(pm2), project).status_code == 404
    for user in (sales_manager, sales_exec):
        assert add(client_for(user), project).status_code == 403
    assert add(client_for(), project).status_code == 401


def test_admin_can_add_to_any_running_project(client_for, admin, project):
    res = add(client_for(admin), project)
    assert res.status_code == 201 and res.json()["logged_by"]["id"] == admin.pk


# ---- Edit and void -----------------------------------------------------------------------------


def age(expense, minutes):
    Expense.objects.filter(pk=expense.pk).update(
        created_at=timezone.now() - timedelta(minutes=minutes)
    )


def test_pm_can_edit_and_void_their_own_expense_within_the_window(client_for, pm1, make_expense):
    expense = make_expense(pm1, "100.00")
    client = client_for(pm1)
    res = client.patch(
        f"{EXPENSES}/{expense.pk}", {"amount": "150.00", "vendor": "New vendor"}, format="multipart"
    )
    assert (
        res.status_code == 200
        and res.json()["amount"] == "150.00"
        and res.json()["vendor"] == "New vendor"
    )
    voided = client.post(
        f"{EXPENSES}/{expense.pk}/void", {"reason": "entered twice"}, format="json"
    )
    assert voided.status_code == 200 and voided.json()["is_void"] is True


def test_after_the_window_only_admin_can_change_it(client_for, pm1, admin, make_expense):
    expense = make_expense(pm1, "100.00")
    age(expense, 31)
    pm = client_for(pm1)
    res = pm.patch(f"{EXPENSES}/{expense.pk}", {"amount": "1.00"}, format="multipart")
    assert res.status_code == 403 and code(res) == "edit_window_closed"
    assert (
        pm.post(f"{EXPENSES}/{expense.pk}/void", {"reason": "x"}, format="json").status_code == 403
    )
    assert (
        client_for(admin)
        .patch(f"{EXPENSES}/{expense.pk}", {"amount": "2.00"}, format="multipart")
        .status_code
        == 200
    )
    assert (
        client_for(admin)
        .post(f"{EXPENSES}/{expense.pk}/void", {"reason": "x"}, format="json")
        .status_code
        == 200
    )


def test_the_window_edge(client_for, pm1, make_expense):
    expense = make_expense(pm1, "100.00")
    age(expense, 29)
    assert (
        client_for(pm1)
        .patch(f"{EXPENSES}/{expense.pk}", {"vendor": "ok"}, format="multipart")
        .status_code
        == 200
    )


def test_a_pm_cannot_change_an_expense_someone_else_logged(client_for, pm1, admin, make_expense):
    expense = make_expense(admin, "100.00")
    res = client_for(pm1).post(f"{EXPENSES}/{expense.pk}/void", {"reason": "x"}, format="json")
    assert res.status_code == 403


def test_pm_flags_say_who_may_edit(client_for, pm1, admin, make_expense):
    mine = make_expense(pm1, "10.00")
    theirs = make_expense(admin, "20.00")
    rows = {r["id"]: r for r in client_for(pm1).get(EXPENSES).json()["results"]}
    assert rows[mine.pk]["can_edit"] is True and rows[theirs.pk]["can_edit"] is False


def test_void_needs_a_reason_and_leaves_the_row_visible(
    client_for, admin, pm1, make_expense, project
):
    expense = make_expense(pm1, "500.00")
    client = client_for(admin)
    assert client.post(f"{EXPENSES}/{expense.pk}/void", {}, format="json").status_code == 400
    assert (
        client.post(f"{EXPENSES}/{expense.pk}/void", {"reason": ""}, format="json").status_code
        == 400
    )
    assert (
        client.post(
            f"{EXPENSES}/{expense.pk}/void", {"reason": "wrong project"}, format="json"
        ).status_code
        == 200
    )
    body = client.get(f"{BASE}/{project.pk}").json()
    assert body["spent"] == "0.00" and body["remaining"] == "600000.00"
    listed = client.get(f"{BASE}/{project.pk}/expenses").json()["results"]
    assert (
        len(listed) == 1
        and listed[0]["is_void"] is True
        and listed[0]["void_reason"] == "wrong project"
    )
    again = client.post(f"{EXPENSES}/{expense.pk}/void", {"reason": "again"}, format="json")
    assert again.status_code == 409 and code(again) == "expense_void"
    assert (
        client.patch(f"{EXPENSES}/{expense.pk}", {"vendor": "x"}, format="multipart").status_code
        == 409
    )
    assert Expense.objects.count() == 1  # never hard deleted


def test_void_frees_up_budget(client_for, pm1, make_project, make_expense):
    project = make_project(pm=pm1, budget="1000.00")
    first = make_expense(pm1, "1000.00", proj=project)
    assert code(add(client_for(pm1), project, amount="1.00")) == "over_budget"
    services.void_expense(first.pk, pm1, "typo")
    assert add(client_for(pm1), project, amount="1000.00").status_code == 201


def test_editing_an_amount_upwards_re_checks_the_budget(
    client_for, pm1, make_project, make_expense
):
    project = make_project(pm=pm1, budget="1000.00")
    make_expense(pm1, "500.00", proj=project)
    expense = make_expense(pm1, "400.00", proj=project)
    res = client_for(pm1).patch(
        f"{EXPENSES}/{expense.pk}", {"amount": "600.00"}, format="multipart"
    )
    assert res.status_code == 409 and code(res) == "over_budget"
    assert res.json()["error"]["details"] == {
        "remaining": "500.00"
    }  # this expense is not counted against itself
    assert (
        client_for(pm1)
        .patch(f"{EXPENSES}/{expense.pk}", {"amount": "500.00"}, format="multipart")
        .status_code
        == 200
    )


def test_completed_projects_lock_edit_and_void(client_for, pm1, admin, make_expense, project):
    expense = make_expense(pm1, "10.00")
    client_for(pm1).post(f"{BASE}/{project.pk}/complete")
    for user in (pm1, admin):
        c = client_for(user)
        assert (
            c.patch(f"{EXPENSES}/{expense.pk}", {"vendor": "x"}, format="multipart").status_code
            == 409
        )
        assert (
            c.post(f"{EXPENSES}/{expense.pk}/void", {"reason": "x"}, format="json").status_code
            == 409
        )
    row = client_for(pm1).get(f"{EXPENSES}/{expense.pk}").json()
    assert row["can_edit"] is False


def test_replacing_a_receipt_on_edit(client_for, pm1, make_expense):
    expense = make_expense(pm1, "10.00")
    old_name = Expense.objects.get(pk=expense.pk).receipt.name
    res = client_for(pm1).patch(
        f"{EXPENSES}/{expense.pk}", {"receipt": receipt_file("new.png")}, format="multipart"
    )
    assert res.status_code == 200
    fresh = Expense.objects.get(pk=expense.pk)
    assert fresh.receipt.name != old_name and fresh.receipt
    assert not Expense._meta.get_field("receipt").storage.exists(old_name)
