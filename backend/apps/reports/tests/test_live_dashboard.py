"""The admin dashboard computed from real rows in leads, accounts and projects."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Ledger, Payment
from apps.leads.models import Interaction, Lead
from apps.projects.models import Expense, Project
from apps.reports import report_services as rs
from apps.users.tests.conftest import *  # noqa: F401,F403

User = get_user_model()
pytestmark = pytest.mark.django_db
URL = "/api/v1/dashboard/admin"


@pytest.fixture
def world():
    admin = User.objects.create_user("boss", "b@x.com", "pw", role="ADMIN")
    eva = User.objects.create_user("eva", "e@x.com", "pw", role="SALES_EXEC", first_name="Eva")
    pm = User.objects.create_user("pm", "p@x.com", "pw", role="PROJECT_MANAGER", first_name="Pat")
    today = rs.business_today()

    def lead(name, status="NEW", amount=None, source="WEBSITE", **kw):
        won = {"won_at": timezone.now()} if status == "WON" else {}
        return Lead.objects.create(
            name=name, phone=f"+91980000{Lead.objects.count():04d}", status=status,
            proposed_amount=amount, source=source, assigned_to=eva, **won, **kw,
        )  # fmt: skip

    lead("New one", "NEW", "1000.00")
    lead("Talking", "INTERESTED", "5000.00", source="REFERRAL")
    lead("Overdue", "CONTACTED", next_followup_at=timezone.now() - timedelta(days=2))
    lead("Lost one", "LOST")
    won_a = lead("Won A", "WON", "20000.00")
    won_b = lead("Won B", "WON", "10000.00")
    Interaction.objects.create(lead=won_a, type="CALL", created_by=eva)

    # Won A: finalized 100000, 40000 paid 40 days ago (overdue); Won B still awaiting finalization.
    ledger = Ledger.objects.create(
        lead=won_a, total_amount="100000.00", finalized_at=timezone.now() - timedelta(days=60),
        finalized_on=today - timedelta(days=60),
    )  # fmt: skip
    Payment.objects.create(
        ledger=ledger, amount="40000.00", mode="UPI", received_on=today - timedelta(days=40)
    )
    Payment.objects.create(
        ledger=ledger, amount="999.00", mode="UPI", received_on=today, is_void=True
    )
    Payment.objects.create(
        ledger=ledger, amount="5000.00", mode="CASH", received_on=today - timedelta(days=35)
    )

    project = Project.objects.create(
        name="Turf", client_name="Won A", sanctioned_budget="50000.00", pm=pm, lead=won_a
    )
    Project.objects.create(
        name="Done", client_name="X", sanctioned_budget="1000.00", status="COMPLETED"
    )
    Expense.objects.create(project=project, amount="52000.00", category="MATERIALS", spent_on=today)
    Expense.objects.create(
        project=project, amount="9999.00", category="OTHER", spent_on=today, is_void=True
    )
    del won_b
    c = APIClient()
    c.force_authenticate(admin)
    return c


def test_dashboard_numbers_are_calculated_from_the_database(world):
    body = world.get(URL + "?period=all").json()
    k = body["kpis"]
    assert body["data_sources"] == {
        "leads": True, "projects": True, "accounts": True, "expenses": True,
    }  # fmt: skip
    assert k["leads_total"] == 6 and k["open_count"] == 3 and k["open_value"] == "6000.00"
    assert k["won_count"] == 2 and k["lost_count"] == 1 and k["win_rate_pct"] == "66.7"
    assert k["received"] == "45000.00"  # the voided 999 is not counted
    assert k["outstanding"] == "55000.00" and k["outstanding_clients"] == 1
    assert k["outstanding_overdue"] == "55000.00"  # last payment 35 days ago
    assert k["spent"] == "52000.00" and k["net"] == "-7000.00"  # the voided expense is excluded
    assert k["collection_rate_pct"] == "45.0"
    assert k["projects_running"] == 1 and k["projects_completed"] == 1


def test_lists_and_attention_come_from_real_rows(world):
    body = world.get(URL + "?period=all").json()
    assert {s["status"]: s["count"] for s in body["funnel"]}["WON"] == 2
    assert body["sales_by_exec"][0]["name"] == "Eva" and body["sales_by_exec"][0]["won_count"] == 2
    assert {s["source"] for s in body["lead_sources"]} == {"Website", "Referral"}
    burn = body["projects_burn"][0]
    assert burn["name"] == "Turf" and burn["state"] == "over" and burn["pct"] == "104.00"
    aging = {b["bucket"]: b for b in body["collections_aging"]}
    assert aging["31-60"]["count"] == 1 and aging["31-60"]["amount"] == "55000.00"
    assert body["top_overdue_clients"][0]["client"] == "Won A"
    attention = {a["key"]: a["count"] for a in body["attention"]}
    assert attention == {
        "overdue_followups": 1, "won_awaiting_finalization": 1,
        "overdue_payments": 1, "budget_alerts": 1,
    }  # fmt: skip
    assert len(body["recent"]["payments"]) == 2 and len(body["recent"]["expenses"]) == 1
    types = {a["type"] for a in body["recent"]["activity"]}
    assert {"lead", "payment", "expense"} <= types
    assert all("at" not in r for r in body["recent"]["payments"])


def test_trends_and_periods_follow_the_data(world):
    body = world.get(URL + "?period=month").json()
    assert body["kpis"]["received"] == "0.00"  # both real payments are older than this month
    assert body["cashflow"]["spent"][-1] == "52000.00"
    assert sum(body["trends"]["leads_new"]) == 6
    assert sum(Decimal(v) for v in body["trends"]["received"]) <= Decimal("45000.00")
    assert body["kpis"]["received_delta_pct"] is None or isinstance(
        body["kpis"]["received_delta_pct"], str
    )


def test_query_budget(world, django_assert_max_num_queries):
    with django_assert_max_num_queries(20):
        assert world.get(URL + "?period=year").status_code == 200


def test_finance_report_and_margin_use_real_data(world):
    fin = world.get("/api/v1/reports/financial?period=all").json()
    assert fin["data_sources"]["accounts"] is True and fin["note"] is None
    assert fin["totals"]["received"] == "45000.00" and fin["totals"]["outstanding"] == "55000.00"
    assert fin["totals"]["collection_rate_pct"] == "45.0"
    assert fin["top_outstanding_clients"][0] == {
        "name": "Won A", "ledgers": 1, "outstanding": "55000.00"
    }  # fmt: skip
    margin = world.get("/api/v1/reports/project-margin").json()
    row = next(r for r in margin["rows"] if r["name"] == "Turf")
    assert row["name"] == "Turf" and row["pm"] == "Pat" and row["spent"] == "52000.00"
    assert row["total"] == "100000.00" and row["received"] == "45000.00"
    assert row["planned_margin"] == "50000.00" and row["live_margin"] == "-7000.00"
    assert margin["note"] is None
    assert Decimal(row["usage_pct"]) > 100
