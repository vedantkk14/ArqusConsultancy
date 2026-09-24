import csv
import io
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.projects import selectors, services
from apps.projects.models import Expense, Project

from .conftest import BASE, EXPENSES


@pytest.fixture
def portfolio(admin, pm1, pm2, make_project, make_expense):
    """ok (20%), warn (85%), warn (exactly 100%), over (override), no PM, and a completed one."""

    def spend(project, amount, by=None):
        make_expense(by or pm1, str(amount), proj=project, category="LABOUR")

    ok = make_project(pm=pm1, budget="1000.00", name="Alpha ok")
    spend(ok, 200)
    warn = make_project(pm=pm1, budget="1000.00", name="Bravo warn")
    spend(warn, 850)
    edge = make_project(pm=pm2, budget="1000.00", name="Charlie edge")
    spend(edge, 1000, pm2)
    over = make_project(pm=pm2, budget="1000.00", name="Delta over")
    services.add_expense(
        over.pk, admin,
        {"amount": Decimal("1200.00"), "category": "LABOUR", "spent_on": selectors.business_today(),
         "admin_override": True, "override_reason": "client"},
    )  # fmt: skip
    nopm = make_project(pm=None, budget="1000.00", name="Echo no pm")
    done = make_project(pm=pm1, budget="1000.00", name="Foxtrot done")
    spend(done, 500)
    services.complete(done.pk, pm1)
    return {"ok": ok, "warn": warn, "edge": edge, "over": over, "nopm": nopm, "done": done}


def names(res):
    return [p["name"] for p in res.json()["results"]]


def test_status_filter(client_for, admin, portfolio):
    c = client_for(admin)
    assert names(c.get(f"{BASE}?status=running&ordering=name")) == [
        "Alpha ok", "Bravo warn", "Charlie edge", "Delta over", "Echo no pm",
    ]  # fmt: skip
    assert names(c.get(f"{BASE}?status=completed")) == ["Foxtrot done"]
    assert c.get(f"{BASE}?status=RUNNING,COMPLETED").json()["count"] == 6
    assert c.get(f"{BASE}?status=bogus").json()["count"] == 6  # unknown values are ignored


def test_state_filters(client_for, admin, portfolio):
    c = client_for(admin)
    assert names(c.get(f"{BASE}?state=ok&ordering=name")) == [
        "Alpha ok",
        "Echo no pm",
        "Foxtrot done",
    ]
    assert names(c.get(f"{BASE}?state=warn&ordering=name")) == ["Bravo warn", "Charlie edge"]
    assert names(c.get(f"{BASE}?state=over")) == ["Delta over"]


def test_dashboard_link_filters(client_for, admin, portfolio):
    c = client_for(admin)
    assert names(c.get(f"{BASE}?over_budget=true&ordering=name")) == [
        "Bravo warn",
        "Charlie edge",
        "Delta over",
    ]
    assert names(c.get(f"{BASE}?near_limit=true&ordering=name")) == ["Bravo warn", "Charlie edge"]
    assert names(c.get(f"{BASE}?no_pm=true")) == ["Echo no pm"]
    assert names(c.get(f"{BASE}?status=running&over_budget=true&no_pm=true")) == []


def test_pm_filter_search_and_dates(client_for, admin, pm2, portfolio):
    c = client_for(admin)
    assert names(c.get(f"{BASE}?pm={pm2.pk}&ordering=name")) == ["Charlie edge", "Delta over"]
    assert names(c.get(f"{BASE}?pm=none")) == ["Echo no pm"]
    assert names(c.get(f"{BASE}?q=bravo")) == ["Bravo warn"]
    assert c.get(f"{BASE}?q=Client").json()["count"] == 6  # client name is searchable
    assert c.get(f"{BASE}?created_from=2999-01-01").json()["count"] == 0
    today = selectors.business_today().isoformat()
    assert c.get(f"{BASE}?created_from={today}&created_to={today}").json()["count"] == 6
    assert c.get(f"{BASE}?created_from=garbage").json()["count"] == 6


def test_orderings(client_for, admin, portfolio):
    c = client_for(admin)
    assert names(c.get(f"{BASE}?ordering=-usage_pct"))[:3] == [
        "Delta over",
        "Charlie edge",
        "Bravo warn",
    ]
    assert names(c.get(f"{BASE}?ordering=name"))[0] == "Alpha ok"
    assert names(c.get(f"{BASE}?ordering=-spent"))[0] == "Delta over"
    assert c.get(f"{BASE}?ordering=-created_at").status_code == 200
    assert c.get(f"{BASE}?ordering=expected_end_date").status_code == 200
    assert c.get(f"{BASE}?ordering=bogus").status_code == 200  # falls back to the default


def test_pm_lists_are_scoped_and_filters_still_apply(client_for, pm1, portfolio):
    c = client_for(pm1)
    assert names(c.get(f"{BASE}?ordering=name")) == ["Alpha ok", "Bravo warn", "Foxtrot done"]
    assert names(c.get(f"{BASE}?over_budget=true")) == ["Bravo warn"]
    assert c.get(f"{BASE}?pm=none").json()["count"] == 0  # no way to see unassigned projects


def test_pagination_defaults_to_twenty(client_for, admin, make_project):
    for i in range(23):
        make_project(name=f"P{i:02d}")
    body = client_for(admin).get(BASE).json()
    assert body["count"] == 23 and len(body["results"]) == 20 and body["next"]
    assert len(client_for(admin).get(f"{BASE}?page=2").json()["results"]) == 3


def test_summary_counts_and_totals(client_for, admin, pm1, portfolio):
    body = client_for(admin).get(f"{BASE}/summary").json()
    assert body == {
        "running": 5, "completed": 1, "ok": 2, "warn": 2, "over": 1, "no_pm": 1,
        "sanctioned_total": "5000.00", "spent_total": "3250.00",
    }  # fmt: skip
    done = client_for(admin).get(f"{BASE}/summary?status=completed").json()
    assert done["ok"] == 1 and done["spent_total"] == "500.00"
    pm = client_for(pm1).get(f"{BASE}/summary").json()
    assert "no_pm" not in pm and pm["running"] == 2 and pm["completed"] == 1


def test_expense_filters(client_for, admin, pm1, portfolio, make_expense):
    make_expense(
        pm1, "12.34", proj=portfolio["ok"], category="FOOD", vendor="Hotel Sai", description="lunch"
    )
    void = make_expense(pm1, "1.00", proj=portfolio["ok"], category="FOOD", vendor="Hotel Sai")
    services.void_expense(void.pk, admin, "typo")
    c = client_for(admin)
    ok_id = portfolio["ok"].pk
    assert c.get(f"{EXPENSES}?project={ok_id}").json()["count"] == 3
    assert c.get(f"{EXPENSES}?category=FOOD").json()["count"] == 2
    assert c.get(f"{EXPENSES}?category=FOOD,LABOUR&project={ok_id}").json()["count"] == 3
    assert c.get(f"{EXPENSES}?q=hotel").json()["count"] == 2
    assert c.get(f"{EXPENSES}?q=Alpha").json()["count"] == 3  # project name
    assert c.get(f"{EXPENSES}?state=void").json()["count"] == 1
    assert c.get(f"{EXPENSES}?state=active&project={ok_id}").json()["count"] == 2
    assert c.get(f"{EXPENSES}?state=override").json()["count"] == 1
    assert c.get(f"{EXPENSES}?has_receipt=true").json()["count"] == 2
    assert c.get(f"{EXPENSES}?has_receipt=false&state=active").json()["count"] >= 4
    assert c.get(f"{EXPENSES}?logged_by={pm1.pk}&category=FOOD").json()["count"] == 2
    today = selectors.business_today()
    assert c.get(f"{EXPENSES}?date_from={today}&date_to={today}&category=FOOD").json()["count"] == 2
    assert c.get(f"{EXPENSES}?date_from={today + timedelta(days=1)}").json()["count"] == 0
    assert [
        e["amount"] for e in c.get(f"{EXPENSES}?category=FOOD&ordering=-amount").json()["results"]
    ] == ["12.34", "1.00"]


def test_pm_expense_list_is_scoped_to_their_projects(client_for, pm1, pm2, portfolio):
    mine = client_for(pm1).get(f"{EXPENSES}?ordering=-amount").json()["results"]
    assert {e["project_name"] for e in mine} == {"Alpha ok", "Bravo warn", "Foxtrot done"}
    for e in mine:
        assert e["project"] in {portfolio[k].pk for k in ("ok", "warn", "done")}
    assert client_for(pm1).get(f"{EXPENSES}?project={portfolio['edge'].pk}").json()["count"] == 0
    assert (
        client_for(pm1)
        .get(f"{EXPENSES}/{Expense.objects.filter(project=portfolio['edge']).first().pk}")
        .status_code
        == 404
    )


def test_expense_summary_matches_the_filters_and_excludes_void(
    client_for, admin, pm1, portfolio, make_expense
):
    void = make_expense(pm1, "500.00", proj=portfolio["ok"], category="FOOD")
    services.void_expense(void.pk, admin, "typo")
    make_expense(pm1, "10.00", proj=portfolio["ok"], category="FOOD")
    c = client_for(admin)
    body = c.get(f"{EXPENSES}/summary?project={portfolio['ok'].pk}").json()
    assert body["total"] == "210.00" and body["count"] == 2 and body["void_count"] == 1
    assert body["by_category"] == [
        {"category": "LABOUR", "label": "Labour", "total": "200.00", "count": 1},
        {"category": "FOOD", "label": "Food", "total": "10.00", "count": 1},
    ]
    assert c.get(f"{EXPENSES}/summary?category=FOOD").json()["total"] == "10.00"


def test_alerts_lists_running_projects_at_or_over_the_line_worst_first(
    client_for, admin, pm1, portfolio
):
    body = client_for(admin).get(f"{EXPENSES}/alerts").json()
    assert [(r["name"], r["state"]) for r in body["results"]] == [
        ("Delta over", "over"), ("Charlie edge", "warn"), ("Bravo warn", "warn"),
    ]  # fmt: skip
    over = body["results"][0]
    assert over["over_by"] == "200.00" and over["remaining"] == "-200.00" and over["pm_name"]
    assert body["results"][1]["over_by"] == "0.00" and body["results"][1]["remaining"] == "0.00"
    assert client_for(pm1).get(f"{EXPENSES}/alerts").status_code == 403


# ---- CSV ---------------------------------------------------------------------------------------


def read_csv(res):
    text = b"".join(res.streaming_content).decode("utf-8-sig")
    return list(csv.reader(io.StringIO(text)))


def test_csv_export_has_the_filtered_rows(client_for, admin, portfolio):
    res = client_for(admin).get(f"{EXPENSES}/export?project={portfolio['ok'].pk}")
    assert res.status_code == 200
    assert (
        res["Content-Type"].startswith("text/csv") and "expenses.csv" in res["Content-Disposition"]
    )
    rows = read_csv(res)
    assert rows[0][:3] == ["Date", "Project", "Category"]
    assert len(rows) == 2 and rows[1][1] == "Alpha ok" and rows[1][5] == "200.00"


def test_csv_neutralises_formulas(client_for, admin, pm1, project, make_expense):
    make_expense(pm1, "5.00", vendor='=HYPERLINK("http://evil")', description="+1+1")
    make_expense(pm1, "6.00", vendor="@SUM(A1)", description="-2+3")
    make_expense(pm1, "7.00", vendor="\tcmd", description="fine")
    rows = read_csv(client_for(admin).get(f"{EXPENSES}/export"))[1:]
    cells = [c for row in rows for c in row]
    for cell in cells:
        assert cell[:1] not in ("=", "+", "-", "@", "\t", "\r"), cell
    assert (
        '\'=HYPERLINK("http://evil")' in cells
        and "'+1+1" in cells
        and "'@SUM(A1)" in cells
        and "'-2+3" in cells
    )


def test_csv_is_capped(client_for, admin, project, monkeypatch):
    from apps.projects import rules

    monkeypatch.setattr(rules, "EXPORT_MAX_ROWS", 3)
    for i in range(5):
        Expense.objects.create(project=project, amount=Decimal("1.00"), category="LABOUR",
                               spent_on=selectors.business_today(), vendor=f"v{i}")  # fmt: skip
    assert len(read_csv(client_for(admin).get(f"{EXPENSES}/export"))) == 4  # header + 3


def test_export_is_admin_only(client_for, pm1, sales_manager, project):
    assert client_for(pm1).get(f"{EXPENSES}/export").status_code == 403
    assert client_for(sales_manager).get(f"{EXPENSES}/export").status_code == 403


# ---- Query budgets -----------------------------------------------------------------------------


def test_list_and_detail_query_budgets(client_for, admin, pm1, make_project, make_expense):
    projects = [make_project(pm=pm1, name=f"P{i:02d}") for i in range(20)]
    for p in projects[:5]:
        make_expense(pm1, "10.00", proj=p)
    for user in (admin, pm1):
        c = client_for(user)
        with CaptureQueriesContext(connection) as list_q:
            assert c.get(BASE).status_code == 200
        assert len(list_q) < 8, [q["sql"][:80] for q in list_q]
        with CaptureQueriesContext(connection) as detail_q:
            assert c.get(f"{BASE}/{projects[0].pk}").status_code == 200
        assert len(detail_q) < 15
        with CaptureQueriesContext(connection) as exp_q:
            assert c.get(EXPENSES).status_code == 200
        assert len(exp_q) < 8


def test_project_count_uses_a_single_annotated_query(client_for, admin, make_project):
    for i in range(3):
        make_project(name=f"P{i}")
    with CaptureQueriesContext(connection) as ctx:
        client_for(admin).get(BASE)
    selects = [q for q in ctx if q["sql"].lstrip().upper().startswith("SELECT")]
    assert (
        sum("projects_project" in q["sql"] and "COUNT" not in q["sql"].upper() for q in selects)
        == 1
    )
    assert Project.objects.count() == 3
