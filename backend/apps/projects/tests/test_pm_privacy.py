"""Privacy-shield leak tests (owner: Dev B).

Rule: a PROJECT_MANAGER never sees the Total Project Amount, lead data or payments.
They see only the Sanctioned Budget on their own projects. See docs/ARCHITECTURE.md.
"""

import pytest

from apps.projects import services

from .conftest import BASE, EXPENSES, LEAD_PHONE, TOTAL, assert_no_leak, expense_form, leak_keys


@pytest.fixture
def full_project(project, pm1, make_expense, admin):
    """A project with a normal, a voided and an overridden expense, so every payload has content."""
    make_expense(pm1, "1000.00")
    void = make_expense(pm1, "500.00")
    services.void_expense(void.pk, admin, "typo")
    return project


def test_the_scanner_itself_catches_leaks():
    assert leak_keys({"a": {"total_amount": 1}}) == ["$.a.total_amount"]
    assert leak_keys([{"lead_id": 1}]) == ["$[0].lead_id"]
    assert leak_keys({"name": "x", "spent": "1"}) == []


def test_pm_project_detail_and_list_have_no_finance_or_lead_data(client_for, pm1, full_project):
    client = client_for(pm1)
    detail = client.get(f"{BASE}/{full_project.pk}")
    assert detail.status_code == 200
    assert_no_leak(detail)
    listing = client.get(BASE)
    assert listing.json()["count"] == 1
    assert_no_leak(listing)
    for query in (
        "?status=running",
        "?state=ok",
        "?over_budget=true",
        "?q=turf",
        "?ordering=-usage_pct",
    ):
        assert_no_leak(client.get(f"{BASE}{query}"))


def test_pm_response_has_exactly_the_allowed_keys(client_for, pm1, full_project):
    body = client_for(pm1).get(f"{BASE}/{full_project.pk}").json()
    assert set(body) == {
        "id", "name", "client_name", "status", "start_date", "expected_end_date", "completed_at",
        "created_at", "pm_name", "sanctioned_budget", "spent", "remaining", "usage_pct", "state",
        "scope", "allowed_actions",
    }  # fmt: skip


def test_pm_never_sees_the_lead_or_total_even_as_null(client_for, pm1, full_project):
    body = client_for(pm1).get(f"{BASE}/{full_project.pk}").json()
    for key in ("lead", "lead_id", "finance", "total_amount", "proposed_amount", "pm"):
        assert key not in body


@pytest.mark.parametrize(
    "path",
    ["/summary", "/{id}/events", "/{id}/expenses", "/{id}/expenses?category=MATERIALS"],
)
def test_pm_project_sub_endpoints_do_not_leak(client_for, pm1, full_project, path):
    res = client_for(pm1).get(BASE + path.format(id=full_project.pk))
    assert res.status_code == 200
    assert_no_leak(res)


def test_pm_expense_endpoints_do_not_leak(client_for, pm1, full_project, make_expense):
    client = client_for(pm1)
    expense = make_expense(pm1, "10.00")
    for url in (
        EXPENSES,
        f"{EXPENSES}/summary",
        f"{EXPENSES}/{expense.pk}",
        f"{EXPENSES}?state=void",
    ):
        res = client.get(url)
        assert res.status_code == 200, url
        assert_no_leak(res)


def test_pm_write_responses_do_not_leak(client_for, pm1, full_project):
    client = client_for(pm1)
    created = client.post(f"{BASE}/{full_project.pk}/expenses", expense_form(), format="multipart")
    assert created.status_code == 201
    assert_no_leak(created)
    done = client.post(f"{BASE}/{full_project.pk}/complete")
    assert done.status_code == 200
    assert_no_leak(done)


def test_pm_error_bodies_do_not_leak_the_total(client_for, pm1, full_project):
    client = client_for(pm1)
    over = client.post(
        f"{BASE}/{full_project.pk}/expenses", expense_form(amount="9999999.00"), format="multipart"
    )
    assert over.status_code == 409 and over.json()["error"]["code"] == "over_budget"
    assert_no_leak(over)
    assert set(over.json()["error"]["details"]) == {"remaining"}
    bad = client.post(
        f"{BASE}/{full_project.pk}/expenses", expense_form(amount="-5"), format="multipart"
    )
    assert bad.status_code == 400
    assert_no_leak(bad)
    assert_no_leak(client.get(f"{BASE}/999999"))
    client.post(f"{BASE}/{full_project.pk}/complete")
    locked = client.post(f"{BASE}/{full_project.pk}/expenses", expense_form(), format="multipart")
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "project_completed"
    assert_no_leak(locked)
    for url, body in (
        (f"{BASE}/{full_project.pk}/budget", {"sanctioned_budget": "1.00", "reason": "x"}),
        (f"{BASE}/{full_project.pk}/reopen", {"reason": "x"}),
        (f"{BASE}/{full_project.pk}/assign-pm", {"pm": None}),
        (BASE, {"lead": 1}),
    ):
        assert_no_leak(client.post(url, body, format="json"))


def test_pm_cannot_reach_admin_only_endpoints(client_for, pm1, full_project):
    client = client_for(pm1)
    assert client.get(f"{BASE}/convertible").status_code == 403
    assert client.get(f"{BASE}/managers").status_code == 403
    assert client.get(f"{EXPENSES}/alerts").status_code == 403
    assert client.get(f"{EXPENSES}/export").status_code == 403


def test_pm_cannot_access_payments_or_ledger(client_for, pm1):
    """There is no accounts endpoint yet; whatever Dev C adds must answer 403 for a PM."""
    client = client_for(pm1)
    for url in ("/api/v1/accounts/ledgers", "/api/v1/accounts/payments"):
        assert client.get(url).status_code in (403, 404)


def test_pm_only_sees_own_projects(client_for, pm1, pm2, make_project):
    mine = make_project(pm=pm1)
    theirs = make_project(pm=pm2)
    client = client_for(pm1)
    assert [p["id"] for p in client.get(BASE).json()["results"]] == [mine.pk]
    assert client.get(f"{BASE}/{theirs.pk}").status_code == 404
    assert client.get(f"{BASE}/{theirs.pk}/events").status_code == 404
    assert client.get(f"{BASE}/{theirs.pk}/expenses").status_code == 404
    assert (
        client.post(f"{BASE}/{theirs.pk}/expenses", expense_form(), format="multipart").status_code
        == 404
    )
    assert client.post(f"{BASE}/{theirs.pk}/complete").status_code == 404


def test_the_lead_phone_and_total_are_absent_from_every_pm_page_of_text(
    client_for, pm1, full_project
):
    text = client_for(pm1).get(f"{BASE}/{full_project.pk}").content.decode()
    assert LEAD_PHONE not in text and str(TOTAL) not in text
