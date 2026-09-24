"""Reports: permission matrix, aggregation on seeded leads, fallbacks, query budgets, CSV safety."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.leads.models import Lead
from apps.reports import report_services as rs
from apps.users.tests.conftest import *  # noqa: F401,F403

User = get_user_model()
pytestmark = pytest.mark.django_db
BASE = "/api/v1/reports/"
ALL = ["sales", "financial", "project-margin", "lead-funnel"]


def make(name, role, **extra):
    return User.objects.create_user(name, f"{name}@crm.local", "pw", role=role, **extra)


def client(user=None):
    c = APIClient()
    if user:
        c.force_authenticate(user)
    return c


def lead(owner, status="NEW", amount=None, source="WEBSITE", **extra):
    fields = {"won_at": timezone.now()} if status == "WON" else {}
    return Lead.objects.create(
        name=f"L-{Lead.objects.count()}",
        phone="+919876543210",
        assigned_to=owner,
        status=status,
        proposed_amount=amount,
        source=source,
        **fields,
        **extra,
    )


@pytest.fixture
def team():
    admin = make("boss", "ADMIN")
    eva = make("eva", "SALES_EXEC", first_name="Eva", commission_rate="10.00")
    raj = make("raj", "SALES_EXEC", first_name="Raj", commission_rate="0")
    return admin, eva, raj


# ---- Permissions ----------


@pytest.mark.parametrize("report", ALL)
@pytest.mark.parametrize(
    "role,expected",
    [("ADMIN", 200), ("SALES_MANAGER", None), ("SALES_EXEC", 403), ("PROJECT_MANAGER", 403)],
)
def test_permission_matrix(report, role, expected):
    if expected is None:  # Sales Manager: the Sales report only
        expected = 200 if report == "sales" else 403
    assert client(make("u", role)).get(BASE + report).status_code == expected


@pytest.mark.parametrize("report", ALL)
def test_anonymous_is_401(report):
    assert client().get(BASE + report).status_code == 401


# ---- Sales ----------


def test_sales_aggregates_per_exec_with_commission(team):
    admin, eva, raj = team
    lead(eva, "WON", "1000.00")
    lead(eva, "WON", "500.50")
    lead(eva, "LOST")
    lead(eva, "NEW")
    lead(raj, "WON", "200.00")
    data = client(admin).get(BASE + "sales?period=all").json()
    rows = {r["name"]: r for r in data["rows"]}
    assert rows["Eva"]["leads_worked"] == 4 and rows["Eva"]["won"] == 2 and rows["Eva"]["lost"] == 1
    assert rows["Eva"]["won_value"] == "1500.50" and rows["Eva"]["commission"] == "150.05"
    assert rows["Eva"]["conversion_pct"] == "66.7"
    assert rows["Raj"]["commission"] == "0.00"
    assert data["totals"]["won"] == 3 and data["totals"]["won_value"] == "1700.50"
    assert data["totals"]["commission"] == "150.05"


def test_sales_period_filters_and_custom(team):
    admin, eva, _ = team
    old = lead(eva, "WON", "100.00")
    Lead.objects.filter(pk=old.pk).update(
        created_at=timezone.now() - timedelta(days=400), won_at=timezone.now() - timedelta(days=400)
    )
    lead(eva, "WON", "50.00")
    c = client(admin)
    assert c.get(BASE + "sales?period=month").json()["totals"]["won"] == 1
    assert c.get(BASE + "sales?period=all").json()["totals"]["won"] == 2
    today = rs.business_today()
    custom = f"sales?period=custom&from={today - timedelta(days=1)}&to={today}"
    assert c.get(BASE + custom).json()["totals"]["won_value"] == "50.00"


def test_custom_period_validation(team):
    c = client(team[0])
    assert c.get(BASE + "sales?period=custom").status_code == 400
    assert c.get(BASE + "sales?period=custom&from=2026-02-01&to=2026-01-01").status_code == 400
    assert c.get(BASE + "sales?period=weekly").status_code == 400


# ---- Fallbacks (accounts / projects models not merged) ----------


def test_finance_reports_fall_back_without_error(team):
    c = client(team[0])
    fin = c.get(BASE + "financial?period=year").json()
    assert fin["data_sources"]["accounts"] is False and fin["note"]
    assert len(fin["months"]) == 12 == len(fin["received"])
    assert fin["totals"]["received"] == "0.00" and fin["top_outstanding_clients"] == []
    assert [a["bucket"] for a in fin["aging"]] == ["0-30", "31-60", "61-90", "90+"]
    margin = c.get(BASE + "project-margin").json()
    assert (
        margin["rows"] == [] and margin["note"] == "Financial figures pending accounts integration."
    )
    assert len(c.get(BASE + "financial").json()["months"]) == 6


def test_leads_reports_degrade_when_leads_model_missing(monkeypatch, team):
    monkeypatch.setattr(rs, "_model", lambda app, name: None)
    c = client(team[0])
    sales = c.get(BASE + "sales").json()
    assert sales["data_sources"]["leads"] is False and sales["totals"]["won"] == 0
    funnel = c.get(BASE + "lead-funnel").json()
    assert funnel["sources"] == [] and all(s["count"] == 0 for s in funnel["stages"])


# ---- Lead funnel ----------


def test_lead_funnel_stages_conversion_and_sources(team):
    admin, eva, _ = team
    for _ in range(4):
        lead(eva, "NEW", "10.00")
    for _ in range(2):
        lead(eva, "CONTACTED", "20.00", source="REFERRAL")
    lead(eva, "INTERESTED", "30.00", source="REFERRAL")
    lead(eva, "WON", "40.00")
    lead(eva, "LOST", "5.00")
    data = client(admin).get(BASE + "lead-funnel?period=all").json()
    stages = {s["status"]: s for s in data["stages"]}
    assert [stages[s]["count"] for s in ("NEW", "CONTACTED", "INTERESTED", "WON")] == [4, 2, 1, 1]
    assert stages["NEW"]["reached"] == 8 and stages["CONTACTED"]["reached"] == 4
    assert (
        stages["CONTACTED"]["conversion_pct"] == "50.0" and stages["NEW"]["conversion_pct"] is None
    )
    assert stages["WON"]["value"] == "40.00" and data["lost"] == {"count": 1, "value": "5.00"}
    web = next(s for s in data["sources"] if s["source"] == "WEBSITE")
    assert web["leads"] == 6 and web["won"] == 1 and web["label"] == "Website"


# ---- Query budgets ----------


@pytest.mark.parametrize("report", ALL)
def test_each_report_stays_under_15_queries(report, team, django_assert_max_num_queries):
    admin, eva, raj = team
    for owner in (eva, raj):
        lead(owner, "WON", "10.00")
        lead(owner, "NEW")
    c = client(admin)
    with django_assert_max_num_queries(15):
        assert c.get(BASE + report + "?period=all").status_code == 200


# ---- CSV ----------


def test_csv_cell_neutralises_formulas_but_keeps_numbers():
    assert rs.csv_cell("=SUM(A1)") == "'=SUM(A1)"
    assert rs.csv_cell("+1 555") == "'+1 555"
    assert rs.csv_cell("-cmd") == "'-cmd"
    assert rs.csv_cell("@x") == "'@x"
    assert rs.csv_cell("-12.50") == "-12.50"
    assert rs.csv_cell(None) == "" and rs.csv_cell("Ann") == "Ann"


@pytest.mark.parametrize("report", ALL)
def test_csv_export_downloads(report, team):
    res = client(team[0]).get(BASE + report + "?export=csv")
    assert res.status_code == 200 and res["Content-Type"].startswith("text/csv")
    assert "attachment" in res["Content-Disposition"] and ".csv" in res["Content-Disposition"]


def test_sales_csv_prefixes_formula_names(team):
    admin, eva, _ = team
    eva.first_name = "=HYPERLINK(1)"
    eva.save()
    lead(eva, "WON", "5.00")
    body = client(admin).get(BASE + "sales?period=all&export=csv").content.decode()
    assert "'=HYPERLINK(1)" in body and ",=HYPERLINK" not in body
    assert body.splitlines()[0].startswith("Executive,Leads worked")
    assert Decimal("5.00") == Decimal(body.splitlines()[-1].split(",")[5])
