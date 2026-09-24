"""GET /api/v1/dashboard/sales-exec (Dev A). The Exec's own leads only."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from apps.leads.dashboard_exec_views import _upcoming
from apps.leads.models import LeadStatus

BASE = "/api/v1/dashboard/sales-exec"
LEAK_KEYS = ("ledger", "payment", "project", "total_amount", "final_amount", "finance")
IST = ZoneInfo("Asia/Kolkata")
UTC = ZoneInfo("UTC")


def _find_leak(value) -> str | None:
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
def scenario(exec_a, exec_b, make_lead, future):
    """Exec A: overdue, won, lost, new/untouched, no-followup. Exec B: one unrelated lead."""
    now = timezone.now()
    overdue = make_lead(
        assigned_to=exec_a, status=LeadStatus.CONTACTED, next_followup_at=now - timedelta(days=2)
    )
    won = make_lead(assigned_to=exec_a, status=LeadStatus.WON, won_at=now, proposed_amount=200000)
    make_lead(assigned_to=exec_a, status=LeadStatus.LOST, lost_reason="PRICE")
    new_untouched = make_lead(assigned_to=exec_a, status=LeadStatus.NEW)
    no_followup = make_lead(assigned_to=exec_a, status=LeadStatus.CONTACTED, next_followup_at=None)
    other = make_lead(
        assigned_to=exec_b, status=LeadStatus.CONTACTED, next_followup_at=now - timedelta(days=1)
    )
    return {
        "exec_a": exec_a,
        "exec_b": exec_b,
        "overdue": overdue,
        "won": won,
        "new_untouched": new_untouched,
        "no_followup": no_followup,
        "other": other,
    }


class TestAccess:
    def test_anonymous_401(self, client_for):
        assert client_for().get(BASE).status_code == 401

    @pytest.mark.parametrize("role_fixture", ["admin", "manager", "pm"])
    def test_other_roles_403(self, client_for, request, role_fixture):
        user = request.getfixturevalue(role_fixture)
        assert client_for(user).get(BASE).status_code == 403

    def test_exec_200(self, client_for, exec_a):
        assert client_for(exec_a).get(BASE).status_code == 200

    def test_bad_period_400(self, client_for, exec_a):
        assert client_for(exec_a).get(BASE, {"period": "nonsense"}).status_code == 400


class TestScoping:
    def test_exec_a_never_sees_exec_b(self, client_for, scenario):
        body = client_for(scenario["exec_a"]).get(BASE, {"period": "all"}).json()
        all_ids = {item["id"] for q in body["queues"].values() for item in q["items"]}
        all_ids |= {item["id"] for day in body["upcoming"] for item in day["items"]}
        assert scenario["other"].id not in all_ids
        assert scenario["overdue"].id in all_ids

    def test_empty_exec_returns_zeros(self, client_for, exec_a):
        body = client_for(exec_a).get(BASE, {"period": "all"}).json()
        assert body["kpis"]["open_leads"] == 0
        assert body["kpis"]["won_count"] == 0
        assert body["kpis"]["conversion_pct"] == "0.0"
        assert body["queues"]["overdue"] == {"total": 0, "items": []}
        assert body["upcoming"] == []
        assert body["recent_activity"] == []
        assert all(row["count"] == 0 for row in body["pipeline"])


class TestShape:
    def test_no_finance_leak(self, client_for, scenario):
        body = client_for(scenario["exec_a"]).get(BASE, {"period": "all"}).json()
        assert _find_leak(body) is None

    def test_money_is_a_two_decimal_string(self, client_for, scenario):
        body = client_for(scenario["exec_a"]).get(BASE, {"period": "all"}).json()
        assert body["kpis"]["won_value"] == "200000.00"
        by_id = {item["id"]: item for item in body["queues"]["no_followup"]["items"]}
        assert by_id[scenario["no_followup"].id]["proposed_amount"] is None

    def test_conversion_pct(self, client_for, scenario):
        body = client_for(scenario["exec_a"]).get(BASE, {"period": "all"}).json()
        # 1 won, 1 lost -> 50.0%
        assert body["kpis"]["won_count"] == 1
        assert body["kpis"]["lost_count"] == 1
        assert body["kpis"]["conversion_pct"] == "50.0"

    def test_queue_ordering_and_cap(self, client_for, exec_a, make_lead):
        now = timezone.now()
        leads = [
            make_lead(
                assigned_to=exec_a,
                status=LeadStatus.CONTACTED,
                next_followup_at=now - timedelta(days=n),
            )
            for n in range(1, 13)
        ]
        body = client_for(exec_a).get(BASE, {"period": "all"}).json()
        overdue = body["queues"]["overdue"]
        assert overdue["total"] == 12
        assert len(overdue["items"]) == 10
        # Most overdue (oldest next_followup_at) first.
        assert overdue["items"][0]["id"] == leads[-1].id

    def test_query_budget(self, client_for, scenario, django_assert_max_num_queries):
        with django_assert_max_num_queries(15):
            client_for(scenario["exec_a"]).get(BASE, {"period": "all"})


class TestUpcomingTimezone:
    """20:00 UTC on 25 Sept is 01:30 IST on 26 Sept - must group under the 26th, not the 25th."""

    def test_groups_by_business_tz_date_not_utc(self, exec_a, make_lead):
        now = datetime(2026, 9, 25, 10, 0, tzinfo=UTC)  # 15:30 IST on the 25th
        followup_utc = datetime(2026, 9, 25, 20, 0, tzinfo=UTC)  # 01:30 IST on the 26th
        lead = make_lead(
            assigned_to=exec_a, status=LeadStatus.CONTACTED, next_followup_at=followup_utc
        )

        leads_qs = exec_a.assigned_leads.all()
        days = _upcoming(leads_qs, now)

        assert len(days) == 1
        assert days[0]["date"] == "2026-09-26"
        assert days[0]["items"][0]["id"] == lead.id

    def test_just_before_midnight_ist_is_still_today_in_ist(self, exec_a, make_lead):
        now = datetime(2026, 9, 25, 10, 0, tzinfo=UTC)  # 15:30 IST on the 25th
        followup_utc = datetime(2026, 9, 25, 18, 25, tzinfo=UTC)  # 23:55 IST, still today
        make_lead(
            assigned_to=exec_a, status=LeadStatus.CONTACTED, next_followup_at=followup_utc
        )

        leads_qs = exec_a.assigned_leads.all()
        days = _upcoming(leads_qs, now)

        # "Upcoming" starts strictly after the end of today (IST) - 23:55 IST today is due_today,
        # not upcoming, so it must NOT appear here at all (belongs in the "today" queue instead).
        assert days == []
