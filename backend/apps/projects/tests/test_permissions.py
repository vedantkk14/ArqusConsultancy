"""Who may call what, for every endpoint. 401 when anonymous, 403 for the Sales Exec.

The Sales Manager reads projects (no money: see test_sales_manager.py) and gets 403 on every write
and on the money-only endpoints.
"""

#: Read-only project screens a Sales Manager may open.
SM_READS = {"get:list", "get:summary", "get:detail", "get:events", "get:expenses", "get:x-list"}
SM_READS |= {"get:x-detail"}  # never the receipt file: it shows the amount

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
        ("post", f"{BASE}/{p}/assign-pm", {"pm": None}),
        ("post", f"{BASE}/{p}/complete", {}),
        ("post", f"{BASE}/{p}/reopen", {"reason": "r"}),
        ("get", f"{BASE}/{p}/events", None),
        ("get", f"{BASE}/{p}/expenses", None),
        ("post", f"{BASE}/{p}/expenses", "form"),
        ("post", BASE, {"opportunity": 1, "name": "x"}),
        ("get", EXPENSES, None),
        ("get", f"{EXPENSES}/summary", None),
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


def test_the_sales_exec_gets_403_everywhere(client_for, sales_exec, world):
    for method, url, body in endpoints(world):
        assert call(client_for(sales_exec), method, url, body).status_code == 403, (method, url)


def _sm_read(method, url, w) -> bool:
    p, e = w["project"].pk, w["expense"].pk
    reads = {
        ("get", BASE), ("get", f"{BASE}/summary"), ("get", f"{BASE}/{p}"),
        ("get", f"{BASE}/{p}/events"), ("get", f"{BASE}/{p}/expenses"), ("get", EXPENSES),
        ("get", f"{EXPENSES}/{e}"),
    }  # fmt: skip
    return (method, url) in reads


def test_the_sales_manager_reads_but_never_writes(client_for, sales_manager, world):
    from apps.projects.models import Expense, Project

    for method, url, body in endpoints(world):
        status = call(client_for(sales_manager), method, url, body).status_code
        expected = 200 if _sm_read(method, url, world) else 403
        assert status == expected, (method, url, status)
    project = Project.objects.get(pk=world["project"].pk)
    assert project.status == "RUNNING" and project.name != "x" and project.pm_id is not None
    assert Expense.objects.count() == 1 and Expense.objects.get().is_void is False


def test_a_pm_gets_403_on_admin_only_actions_and_404_on_projects_that_are_not_theirs(
    client_for, pm2, world
):
    admin_only = [
        ("get", f"{BASE}/convertible"), ("get", f"{BASE}/managers"),
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
        ("post", f"{BASE}/{p}/assign-pm", {"pm": None}),
        ("post", f"{BASE}/{p}/reopen", {"reason": "r"}),
    ]:
        assert call(client_for(pm1), method, url, body).status_code == 403, url


def test_admin_can_use_every_read_endpoint(client_for, admin, world):
    for method, url, body in endpoints(world):
        if method == "get" and not url.endswith("/receipt"):
            assert call(client_for(admin), method, url, body).status_code == 200, url


def test_the_removed_budget_endpoints_are_gone(client_for, admin, world):
    p = world["project"].pk
    c = client_for(admin)
    assert (
        c.post(f"{BASE}/{p}/budget", {"sanctioned_budget": "1"}, format="json").status_code == 404
    )
    assert c.post(f"{BASE}/{p}/budget-request", {"amount": "1"}, format="json").status_code == 404
    assert c.post(f"{BASE}/{p}/release-budget", {}, format="json").status_code == 404
    assert c.get(f"{EXPENSES}/alerts").status_code == 404


def test_unknown_ids_are_404_for_everyone_who_may_ask(client_for, admin, pm1):
    for user in (admin, pm1):
        c = client_for(user)
        assert c.get(f"{BASE}/999999").status_code == 404
        assert c.get(f"{EXPENSES}/999999").status_code == 404
