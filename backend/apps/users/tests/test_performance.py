"""Team > member detail: who may open whom, and the figures."""

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.leads.models import Lead
from apps.projects.models import Expense, Project

from .conftest import *  # noqa: F401,F403

User = get_user_model()
pytestmark = pytest.mark.django_db


def make(name, role, **extra):
    return User.objects.create_user(name, f"{name}@x.com", "pw", role=role, **extra)


def as_(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def url(user):
    return f"/api/v1/users/{user.pk}/performance"


@pytest.fixture
def people():
    return {
        "admin": make("boss", "ADMIN"),
        "sm": make("sam", "SALES_MANAGER"),
        "exec": make("eva", "SALES_EXEC", first_name="Eva", commission_rate="10.00"),
        "pm": make("pat", "PROJECT_MANAGER", first_name="Pat"),
    }


def test_who_may_open_whom(people):
    admin, sm, ex, pm = people["admin"], people["sm"], people["exec"], people["pm"]
    for target in (admin, sm, ex, pm):
        assert as_(admin).get(url(target)).status_code == 200
    assert as_(sm).get(url(ex)).status_code == 200
    for hidden in (admin, pm, sm):
        assert as_(sm).get(url(hidden)).status_code == 404
    assert as_(ex).get(url(ex)).status_code == 403
    assert as_(pm).get(url(pm)).status_code == 403


def test_sales_figures(people):
    ex = people["exec"]

    def lead(status, amount=None, **kw):
        won = {"won_at": timezone.now()} if status == "WON" else {}
        return Lead.objects.create(
            name=status, phone=f"+91980000{Lead.objects.count():04d}", status=status,
            assigned_to=ex, proposed_amount=amount, **won, **kw,
        )  # fmt: skip

    lead("WON", "1000.00")
    lead("WON", "500.00")
    lead("LOST", lost_reason="PRICE")
    lead("NEW", "200.00", next_followup_at=timezone.now() - timedelta(days=1))
    body = as_(people["sm"]).get(url(ex)).json()
    leads = body["leads"]
    assert (leads["assigned"], leads["open"], leads["won"], leads["lost"]) == (4, 1, 2, 1)
    assert leads["conversion_pct"] == "66.7" and leads["won_value"] == "1500.00"
    assert leads["overdue_followups"] == 1 and leads["commission_earned"] == "150.00"
    assert leads["lost_reasons"] == [{"reason": "Price", "count": 1}]
    assert len(leads["recent_closed"]) == 3 and body["projects"] is None
    assert body["user"]["commission_rate"] == "10.00"


def test_project_delivery_against_deadline(people):
    pm = people["pm"]
    today = date.today()
    on_time = Project.objects.create(
        name="On time", client_name="A", sanctioned_budget="100.00", pm=pm, status="COMPLETED",
        expected_end_date=today + timedelta(days=5), completed_at=timezone.now(),
    )  # fmt: skip
    Project.objects.create(
        name="Late", client_name="B", sanctioned_budget="100.00", pm=pm, status="COMPLETED",
        expected_end_date=today - timedelta(days=30), completed_at=timezone.now(),
    )  # fmt: skip
    running = Project.objects.create(
        name="Behind", client_name="C", sanctioned_budget="100.00", pm=pm,
        expected_end_date=today - timedelta(days=3),
    )  # fmt: skip
    Expense.objects.create(project=running, amount="150.00", category="OTHER", spent_on=today)
    del on_time
    p = as_(people["admin"]).get(url(pm)).json()["projects"]
    assert (p["managed"], p["running"], p["completed"]) == (3, 1, 2)
    assert (p["completed_on_time"], p["completed_late"], p["on_time_pct"]) == (1, 1, "50.0")
    assert p["running_overdue"] == 1 and p["over_budget"] == 1 and p["spent"] == "150.00"
    assert {x["name"]: x["delivery"] for x in p["projects"]} == {
        "On time": "on_time", "Late": "late", "Behind": "overdue",
    }  # fmt: skip


def test_sales_manager_does_not_see_project_managers_in_assignments(people):
    body = as_(people["sm"]).get("/api/v1/users/assignments-overview").json()
    assert body["pms"] == [] and [e["name"] for e in body["execs"]] == ["Eva"]
    assert [
        p["name"]
        for p in as_(people["admin"]).get("/api/v1/users/assignments-overview").json()["pms"]
    ] == ["Pat"]
