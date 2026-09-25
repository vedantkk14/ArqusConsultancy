"""PM dashboard: access, scoping, privacy, ordering, period and budget consistency."""

from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.projects import services

from .conftest import BASE, days_ago, leak_keys

URL = "/api/v1/dashboard/pm"
BANNED_KEYS = (
    "total_amount", "proposed_amount", "ledger", "payment", "received", "outstanding", "margin",
    "lead", "phone", "email", "exec", "commission", "final",
)  # fmt: skip


def get(client_for, user, query=""):
    return client_for(user).get(URL + query)


def spend(make_expense, pm, proj, pct_of_600k):
    amount = Decimal("600000.00") * Decimal(pct_of_600k) / 100
    return make_expense(pm, str(amount), proj=proj)


def test_access(client_for, pm1, admin, sales_manager, sales_exec):
    assert client_for().get(URL).status_code == 401
    for user in (admin, sales_manager, sales_exec):
        assert get(client_for, user).status_code == 403
    assert get(client_for, pm1).status_code == 200


def test_empty_pm_gets_zeros_and_empty_lists(client_for, pm1):
    body = get(client_for, pm1).json()
    assert body["projects"] == body["alerts"] == body["recent_expenses"] == []
    assert body["recent_activity"] == []
    assert body["kpis"] == {
        "projects_running": 0, "projects_completed": 0, "total_sanctioned": "0.00",
        "total_spent": "0.00", "total_remaining": "0.00", "expenses_logged_period": 0,
        "expenses_amount_period": "0.00",
    }  # fmt: skip
    assert body["period"]["key"] == "month"


def test_bad_period_is_a_400(client_for, pm1):
    assert get(client_for, pm1, "?period=decade").status_code == 400


def test_pm_never_sees_another_pms_data(client_for, pm1, pm2, make_project, make_expense):
    mine = make_project(pm=pm1, name="Mine")
    theirs = make_project(pm=pm2, name="Theirs")
    spend(make_expense, pm1, mine, 10)
    spend(make_expense, pm2, theirs, 90)
    services.complete(theirs.pk, pm2)
    res = get(client_for, pm1)
    text = res.content.decode()
    assert "Theirs" not in text
    body = res.json()
    assert [p["id"] for p in body["projects"]] == [mine.pk]
    assert body["alerts"] == []
    assert {e["project_id"] for e in body["recent_expenses"]} == {mine.pk}
    assert {a["project_id"] for a in body["recent_activity"]} == {mine.pk}


def test_no_finance_or_lead_data_anywhere(client_for, pm1, admin, make_project, make_expense):
    proj = make_project(pm=pm1)
    make_expense(pm1, "500000.00", proj=proj)
    services.complete(proj.pk, pm1)
    for query in ("", "?period=all", "?period=year"):
        res = get(client_for, pm1, query)
        assert leak_keys(res.json()) == []
        raw = res.content.decode().lower()
        for word in BANNED_KEYS:
            assert f'"{word}' not in raw, word
        for needle in ("1000000", "+9198", "client1@example.com"):
            assert needle not in raw


def test_alerts_are_worst_first_over_before_warn(
    client_for, pm1, admin, make_project, make_expense
):
    ok = make_project(pm=pm1, name="Ok")
    warn_low = make_project(pm=pm1, name="WarnLow")
    warn_high = make_project(pm=pm1, name="WarnHigh")
    over = make_project(pm=pm1, name="Over")
    spend(make_expense, pm1, ok, 10)
    spend(make_expense, pm1, warn_low, 81)
    spend(make_expense, pm1, warn_high, 99)
    services.add_expense(
        over.pk,
        admin,
        {
            "amount": Decimal("650000.00"),
            "category": "LABOUR",
            "spent_on": days_ago(0),
            "admin_override": True,
            "override_reason": "client asked",
        },
    )
    body = get(client_for, pm1).json()
    assert [a["project_name"] for a in body["alerts"]] == ["Over", "WarnHigh", "WarnLow"]
    assert [a["state"] for a in body["alerts"]] == ["over", "warn", "warn"]


def test_completed_projects_come_after_running_and_raise_no_alert(
    client_for, pm1, make_project, make_expense
):
    done = make_project(pm=pm1, name="Done")
    spend(make_expense, pm1, done, 90)
    services.complete(done.pk, pm1)
    make_project(pm=pm1, name="Live")
    body = get(client_for, pm1).json()
    assert [p["name"] for p in body["projects"]] == ["Live", "Done"]
    assert body["alerts"] == []
    assert body["kpis"]["projects_completed"] == 1 and body["kpis"]["projects_running"] == 1


def test_period_only_changes_expense_kpis(client_for, pm1, project, make_expense):
    make_expense(pm1, "1000.00")
    make_expense(pm1, "2000.00", spent_on=days_ago(29))
    month = get(client_for, pm1, "?period=month").json()
    alltime = get(client_for, pm1, "?period=all").json()
    assert alltime["kpis"]["expenses_logged_period"] == 2
    assert alltime["kpis"]["expenses_amount_period"] == "3000.00"
    assert alltime["period"]["from"] is None
    for key in ("total_sanctioned", "total_spent", "total_remaining"):
        assert month["kpis"][key] == alltime["kpis"][key]
    assert month["projects"] == alltime["projects"]
    assert month["alerts"] == alltime["alerts"]


def test_recent_expenses_are_capped_newest_first_and_flag_void_and_receipt(
    client_for, pm1, admin, project, make_expense
):
    made = [make_expense(pm1, "10.00", spent_on=days_ago(i)) for i in range(10)]
    labour = make_expense(pm1, "20.00", category="LABOUR")
    services.void_expense(made[0].pk, admin, "typo")
    rows = get(client_for, pm1).json()["recent_expenses"]
    assert len(rows) == 8
    dates = [r["spent_on"] for r in rows]
    assert dates == sorted(dates, reverse=True)
    by_id = {r["id"]: r for r in rows}
    assert by_id[labour.pk]["has_receipt"] is False
    assert by_id[made[0].pk]["is_void"] is True and by_id[made[0].pk]["has_receipt"] is True
    assert all(isinstance(r["amount"], str) for r in rows)


def test_money_is_strings_everywhere(client_for, pm1, project, make_expense):
    make_expense(pm1, "12.50")
    body = get(client_for, pm1).json()
    for value in body["kpis"].values():
        if isinstance(value, str):
            assert value.count(".") == 1
    for p in body["projects"]:
        for key in ("sanctioned_budget", "spent", "remaining", "usage_pct"):
            assert isinstance(p[key], str)


def test_query_budget(client_for, pm1, make_project, make_expense, django_assert_max_num_queries):
    for n in range(3):
        make_expense(pm1, "100.00", proj=make_project(pm=pm1))
    client = client_for(pm1)
    with CaptureQueriesContext(connection) as ctx:
        assert client.get(URL).status_code == 200
    assert len(ctx) < 12, [q["sql"][:80] for q in ctx]


def test_budget_numbers_match_the_project_detail_exactly(
    client_for, pm1, project, make_expense
):
    make_expense(pm1, "487333.33")
    row = get(client_for, pm1).json()["projects"][0]
    detail = client_for(pm1).get(f"{BASE}/{project.pk}").json()
    for key in ("sanctioned_budget", "spent", "remaining", "usage_pct", "state"):
        assert row[key] == detail[key], key
