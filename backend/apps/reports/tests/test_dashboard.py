from datetime import date
from decimal import Decimal
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.reports.services import (
    PERIODS,
    aging_bucket,
    attention_items,
    burn_state,
    collection_rate_pct,
    delta_pct,
    money,
    pct,
    period_range,
    trend_months,
    win_rate_pct,
)

User = get_user_model()
URL = "/api/v1/dashboard/admin"

KPI_TYPES = {
    "received": str,
    "received_prev": str,
    "received_delta_pct": (str, type(None)),
    "outstanding": str,
    "outstanding_clients": int,
    "outstanding_overdue": str,
    "leads_total": int,
    "leads_new": int,
    "leads_new_prev": int,
    "open_count": int,
    "open_value": str,
    "won_count": int,
    "lost_count": int,
    "win_rate_pct": str,
    "projects_running": int,
    "projects_completed": int,
    "spent": str,
    "net": str,
    "net_margin_pct": str,
    "collection_rate_pct": str,
}


# ---- Definitions ---------------------------------------------------------------------------------


def test_period_ranges_follow_the_financial_year():
    today = date(2026, 9, 24)
    month = period_range("month", today)
    assert (month.start, month.end, month.prev_start, month.prev_end) == (
        date(2026, 9, 1),
        today,
        date(2026, 8, 1),
        date(2026, 8, 31),
    )
    quarter = period_range("quarter", today)  # FY Q2 = Jul-Sep
    assert (quarter.start, quarter.prev_start, quarter.prev_end) == (
        date(2026, 7, 1),
        date(2026, 4, 1),
        date(2026, 6, 30),
    )
    year = period_range("year", date(2026, 2, 10))  # FY 2025-26 started 1 Apr 2025
    assert (year.start, year.prev_start, year.prev_end) == (
        date(2025, 4, 1),
        date(2024, 4, 1),
        date(2025, 3, 31),
    )
    everything = period_range("all", today)
    assert everything.start is None and everything.prev_start is None


def test_period_range_rejects_unknown_period():
    with pytest.raises(ValueError):
        period_range("week", date(2026, 9, 24))


def test_trend_months_crosses_year_boundaries():
    assert trend_months(date(2026, 2, 15)) == [
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
    ]


def test_money_and_win_rate():
    assert money(None) == "0.00"
    assert money(Decimal("1234.505")) == "1234.51"
    assert win_rate_pct(0, 0) == "0.0"
    assert win_rate_pct(18, 6) == "75.0"
    assert win_rate_pct(1, 2) == "33.3"


def test_delta_is_signed_and_null_without_a_baseline():
    assert delta_pct(Decimal("1124"), Decimal("1000"), "month") == "12.4"
    assert delta_pct(Decimal("969"), Decimal("1000"), "month") == "-3.1"
    assert delta_pct(Decimal("500"), Decimal("0"), "month") is None
    assert delta_pct(Decimal("500"), Decimal("100"), "all") is None


# ---- Endpoint ------------------------------------------------------------------------------------


@pytest.fixture
def client():
    return APIClient()


def _user(role):
    return User.objects.create_user(username=role.lower(), password="pw-12345-x", role=role)


@pytest.mark.django_db
def test_requires_authentication(client):
    res = client.get(URL)
    assert res.status_code == 401
    assert res.data["error"]["code"] == "not_authenticated"


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["SALES_MANAGER", "SALES_EXEC", "PROJECT_MANAGER"])
def test_non_admins_are_forbidden(client, role):
    client.force_authenticate(_user(role))
    res = client.get(URL)
    assert res.status_code == 403
    assert res.data["error"]["code"] == "permission_denied"


@pytest.mark.django_db
def test_admin_gets_every_field_with_the_right_types(client, django_assert_max_num_queries):
    client.force_authenticate(_user("ADMIN"))
    with django_assert_max_num_queries(20):
        res = client.get(URL)
    assert res.status_code == 200
    body = res.json()

    assert body["period"] == "month"
    assert set(body["kpis"]) == set(KPI_TYPES)
    for key, expected in KPI_TYPES.items():
        assert isinstance(body["kpis"][key], expected), key
    for key in ("received", "outstanding", "open_value", "outstanding_overdue", "received_prev"):
        assert body["kpis"][key] == "0.00"  # money: strings with two decimals

    assert len(body["trends"]["months"]) == 6
    assert body["trends"]["leads_new"] == [0] * 6
    assert body["trends"]["received"] == ["0.00"] * 6
    assert body["cashflow"]["spent"] == ["0.00"] * 6
    assert set(body["recent"]) == {"payments", "expenses", "activity"}


@pytest.mark.django_db
def test_real_zeros_while_source_models_do_not_exist(client, monkeypatch):
    """A missing projects/accounts model gives real zeros, no invented numbers, empty lists."""
    from apps.reports import services

    real = services._model
    monkeypatch.setattr(
        services, "_model", lambda app, name: real(app, name) if app == "leads" else None
    )
    client.force_authenticate(_user("ADMIN"))
    body = client.get(URL).json()
    sources = body["data_sources"]
    assert sources["leads"] is True  # the leads model exists; no leads yet
    assert not any(v for k, v in sources.items() if k != "leads")
    assert body["kpis"]["win_rate_pct"] == "0.0"
    assert body["kpis"]["received_delta_pct"] is None  # previous period is empty
    assert body["attention"] == []  # only counts above zero are sent
    assert body["funnel"] == [] and body["sales_by_exec"] == []


@pytest.mark.django_db
@pytest.mark.parametrize("period", PERIODS)
def test_period_filter(client, period):
    client.force_authenticate(_user("ADMIN"))
    body = client.get(URL, {"period": period}).json()
    assert body["period"] == period
    assert (body["range"]["start"] is None) == (period == "all")
    if period == "all":
        assert body["kpis"]["received_delta_pct"] is None


@pytest.mark.django_db
def test_unknown_period_is_a_validation_error(client):
    client.force_authenticate(_user("ADMIN"))
    res = client.get(URL, {"period": "week"})
    assert res.status_code == 400
    assert res.data["error"]["code"] == "validation_error"
    assert "period" in res.data["error"]["details"]


def test_attention_only_lists_counts_above_zero_most_severe_first():
    rows = attention_items({"budget_alerts": 2, "overdue_followups": 0, "overdue_payments": 3})
    assert [(r["key"], r["count"], r["severity"]) for r in rows] == [
        ("overdue_payments", 3, "high"),
        ("budget_alerts", 2, "medium"),
    ]
    assert rows[0]["route"] == "/accounts/pending"


@pytest.mark.django_db
def test_no_model_changes_pending():
    out = StringIO()
    call_command("makemigrations", "--check", "--dry-run", stdout=out)
    assert "No changes detected" in out.getvalue()


# ---- Extra fields (bento dashboard) --------------------------------------------------------------


def test_collection_rate_and_pct():
    assert collection_rate_pct(Decimal("620"), Decimal("1000")) == "62.0"
    assert collection_rate_pct(Decimal("5"), Decimal("0")) == "0.0"
    assert pct(1, 3) == "33.3"


@pytest.mark.parametrize(
    "days,bucket",
    [
        (0, "0-30"),
        (30, "0-30"),
        (31, "31-60"),
        (60, "31-60"),
        (61, "61-90"),
        (90, "61-90"),
        (91, "90+"),
        (400, "90+"),
    ],
)
def test_aging_buckets(days, bucket):
    assert aging_bucket(days) == bucket


@pytest.mark.parametrize(
    "spent,sanctioned,state",
    [
        ("0", "100", "ok"),
        ("79.99", "100", "ok"),
        ("80", "100", "warn"),
        ("99.9", "100", "warn"),
        ("100", "100", "over"),
        ("150", "100", "over"),
        ("10", "0", "ok"),
    ],
)
def test_burn_state_uses_the_sanctioned_budget(spent, sanctioned, state):
    assert burn_state(Decimal(spent), Decimal(sanctioned)) == state


@pytest.mark.django_db
def test_extra_fields_have_the_right_shape(client, django_assert_max_num_queries):
    client.force_authenticate(_user("ADMIN"))
    with django_assert_max_num_queries(20):
        body = client.get(URL).json()
    assert body["kpis"]["collection_rate_pct"] == "0.0"
    assert body["kpis"]["spent"] == "0.00" and body["kpis"]["net"] == "0.00"
    assert body["cashflow"]["net"] == ["0.00"] * 6
    assert [b["bucket"] for b in body["collections_aging"]] == ["0-30", "31-60", "61-90", "90+"]
    assert all(b["amount"] == "0.00" and b["count"] == 0 for b in body["collections_aging"])
    for key in ("lead_sources", "top_overdue_clients", "projects_burn"):
        assert body[key] == []  # the source models do not exist yet
