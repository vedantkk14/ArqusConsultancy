"""Who may call what, for every endpoint. 401 when anonymous, 403 for the Sales roles."""

import pytest

from .conftest import BASE, EXPENSES, expense_form


@pytest.fixture
def world(project, pm1, make_expense):
    return {"project": project, "expense": make_expense(pm1, "10.00")}


def endpoints(w):
    p, e = w["project"].pk, w["expense"].pk
    return [
        ("get", BASE, None),
        ("get", f"{BASE}/summary", None),
        ("get", f"{BASE}/convertible", None),
        ("get", f"{BASE}/managers", None),
        ("get", f"{BASE}/{p}", None),
        ("patch", f"{BASE}/{p}", {"name": "x"}),
        ("post", f"{BASE}/{p}/budget", {"sanctioned_budget": "10", "reason": "r"}),
        ("post", f"{BASE}/{p}/assign-pm", {"pm": None}),
        ("post", f"{BASE}/{p}/complete", {}),
        ("post", f"{BASE}/{p}/reopen", {"reason": "r"}),
        ("get", f"{BASE}/{p}/events", None),
        ("get", f"{BASE}/{p}/expenses", None),
        ("post", f"{BASE}/{p}/expenses", "form"),
        ("post", BASE, {"lead": 1, "name": "x", "sanctioned_budget": "1"}),
        ("get", EXPENSES, None),
        ("get", f"{EXPENSES}/summary", None),
        ("get", f"{EXPENSES}/alerts", None),
        ("get", f"{EXPENSES}/export", None),
        ("get", f"{EXPENSES}/{e}", None),
        ("patch", f"{EXPENSES}/{e}", {"vendor": "x"}),
        ("post", f"{EXPENSES}/{e}/void", {"reason": "r"}),
        ("get", f"{EXPENSES}/{e}/receipt", None),
    ]


def call(client, method, url, body):
    if body == "form":
        return client.post(url, expense_form(), format="multipart")
    if method == "get":
        return client.get(url)
    return getattr(client, method)(url, body, format="json")


def test_anonymous_gets_401_everywhere(client_for, world):
    for method, url, body in endpoints(world):
        assert call(client_for(), method, url, body).status_code == 401, (method, url)


def test_sales_roles_get_403_everywhere(client_for, sales_manager, sales_exec, world):
    for user in (sales_manager, sales_exec):
        for method, url, body in endpoints(world):
            assert call(client_for(user), method, url, body).status_code == 403, (
                user.role,
                method,
                url,
            )


def test_a_pm_gets_403_on_admin_only_actions_and_404_on_projects_that_are_not_theirs(
    client_for, pm2, world
):
    admin_only = [
        ("get", f"{BASE}/convertible"), ("get", f"{BASE}/managers"), ("get", f"{EXPENSES}/alerts"),
        ("get", f"{EXPENSES}/export"), ("post", BASE),
    ]  # fmt: skip
    for method, url in admin_only:
        assert call(client_for(pm2), method, url, {}).status_code == 403, url
    p, e = world["project"].pk, world["expense"].pk
    not_theirs = [
        ("get", f"{BASE}/{p}"), ("get", f"{BASE}/{p}/events"), ("get", f"{BASE}/{p}/expenses"),
        ("post", f"{BASE}/{p}/complete"), ("get", f"{EXPENSES}/{e}"),
        ("get", f"{EXPENSES}/{e}/receipt"), ("patch", f"{EXPENSES}/{e}"),
        ("post", f"{EXPENSES}/{e}/void"),
    ]  # fmt: skip
    for method, url in not_theirs:
        assert call(client_for(pm2), method, url, {"reason": "r"}).status_code == 404, url


def test_a_pm_gets_403_on_admin_actions_for_their_own_project(client_for, pm1, world):
    p = world["project"].pk
    for method, url, body in [
        ("patch", f"{BASE}/{p}", {"name": "x"}),
        ("post", f"{BASE}/{p}/budget", {"sanctioned_budget": "10", "reason": "r"}),
        ("post", f"{BASE}/{p}/assign-pm", {"pm": None}),
        ("post", f"{BASE}/{p}/reopen", {"reason": "r"}),
    ]:
        assert call(client_for(pm1), method, url, body).status_code == 403, url


def test_admin_can_use_every_read_endpoint(client_for, admin, world):
    for method, url, body in endpoints(world):
        if method == "get" and not url.endswith("/receipt"):
            assert call(client_for(admin), method, url, body).status_code == 200, url


def test_unknown_ids_are_404_for_everyone_who_may_ask(client_for, admin, pm1):
    for user in (admin, pm1):
        c = client_for(user)
        assert c.get(f"{BASE}/999999").status_code == 404
        assert c.get(f"{EXPENSES}/999999").status_code == 404
