"""GET /api/v1/dashboard/sales-manager (Dev A). Team-scoped view of the leads API."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.leads.models import LeadStatus

BASE = "/api/v1/dashboard/sales-manager"
LEAK_KEYS = ("ledger", "payment", "project", "total_amount", "final_amount", "finance")


def _find_leak(value) -> str | None:
    """First forbidden key found anywhere in the (possibly nested) response body."""
    if isinstance(value, dict):
        for key, sub in value.items():
            if key in LEAK_KEYS:
                return key
            if found := _find_leak(sub):
                return found
    elif isinstance(value, list):
        for item in value:
            if found := _find_leak(item):
                return found
    return None


@pytest.fixture
def team(manager, exec_a, exec_b, make_lead, future):
    """A manager with two execs: a mix of open, overdue, won, lost and one unassigned lead."""
    now = timezone.now()
    overdue_a = make_lead(
        assigned_to=exec_a, status=LeadStatus.CONTACTED, next_followup_at=now - timedelta(days=2)
    )
    make_lead(assigned_to=exec_a, status=LeadStatus.WON, won_at=now, proposed_amount=100000)
    make_lead(assigned_to=exec_b, status=LeadStatus.LOST, lost_reason="PRICE")
    unassigned = make_lead(assigned_to=None, status=LeadStatus.NEW)
    return {
        "manager": manager,
        "exec_a": exec_a,
        "exec_b": exec_b,
        "overdue_a": overdue_a,
        "unassigned": unassigned,
    }


class TestAccess:
    def test_anonymous_401(self, client_for):
        assert client_for().get(BASE).status_code == 401

    @pytest.mark.parametrize("role_fixture", ["admin", "exec_a", "pm"])
    def test_other_roles_403(self, client_for, request, role_fixture):
        user = request.getfixturevalue(role_fixture)
        assert client_for(user).get(BASE).status_code == 403

    def test_manager_200(self, client_for, manager):
        assert client_for(manager).get(BASE).status_code == 200


class TestScopingAndShape:
    def test_team_scoping_and_unassigned(self, client_for, team):
        response = client_for(team["manager"]).get(BASE, {"period": "all"})
        body = response.json()

        # The unassigned lead is counted and queued, never inside the team scope's own queues.
        assert body["kpis"]["unassigned_leads"] == 1
        assert body["queues"]["unassigned"]["total"] == 1
        assert body["queues"]["unassigned"]["items"][0]["id"] == team["unassigned"].id
        assert "assigned_to" not in body["queues"]["unassigned"]["items"][0]

        overdue_ids = {item["id"] for item in body["queues"]["overdue"]["items"]}
        assert team["overdue_a"].id in overdue_ids
        assert team["unassigned"].id not in overdue_ids

    def test_by_executive_includes_zero_lead_exec(self, client_for, team, make_user):
        idle_exec = make_user("SALES_EXEC")
        response = client_for(team["manager"]).get(BASE, {"period": "all"})
        rows = {row["id"]: row for row in response.json()["by_executive"]}
        assert idle_exec.id in rows
        assert rows[idle_exec.id] == {
            "id": idle_exec.id,
            "name": idle_exec.display_name,
            "open_leads": 0,
            "overdue": 0,
            "won_count": 0,
            "won_value": "0.00",
            "conversion_pct": "0.0",
            "load_score": 0,
        }

    def test_by_executive_totals_match_team_totals(self, client_for, team):
        body = client_for(team["manager"]).get(BASE, {"period": "all"}).json()
        won = sum(row["won_count"] for row in body["by_executive"])
        open_leads = sum(row["open_leads"] for row in body["by_executive"])
        assert won == body["kpis"]["team_won_count"]
        assert open_leads == body["kpis"]["team_open_leads"]

    def test_no_finance_leak(self, client_for, team):
        body = client_for(team["manager"]).get(BASE, {"period": "all"}).json()
        assert _find_leak(body) is None

    def test_bad_period_400(self, client_for, manager):
        assert client_for(manager).get(BASE, {"period": "nonsense"}).status_code == 400

    def test_empty_team_fallback(self, client_for, manager):
        # No active Sales Execs at all (the `team` fixture is deliberately not used here):
        # real zeros, not a crash, and an empty by_executive list.
        response = client_for(manager).get(BASE, {"period": "all"})
        assert response.status_code == 200
        body = response.json()
        assert body["by_executive"] == []
        assert body["kpis"]["team_open_leads"] == 0
        assert body["queues"]["overdue"] == {"total": 0, "items": []}


class TestQueryBudget:
    def test_under_15_queries(self, client_for, team, django_assert_max_num_queries):
        with django_assert_max_num_queries(15):
            client_for(team["manager"]).get(BASE, {"period": "all"})
