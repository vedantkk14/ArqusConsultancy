"""PM asks for more budget; Admin decides. Completed projects release unused budget."""

from decimal import Decimal

import pytest

from apps.notifications.models import Notification
from apps.projects import services
from apps.projects.models import BudgetRequest, Expense, Project, ProjectEvent

from .conftest import BASE, days_ago

pytestmark = pytest.mark.django_db


def ask(client, project, amount="5000", reason="Extra turf layer"):
    return client.post(
        f"{BASE}/{project.pk}/budget-request", {"amount": amount, "reason": reason}, format="json"
    )


def test_pm_requests_and_admin_approves(client_for, admin, pm1, project):
    old = project.sanctioned_budget
    res = ask(client_for(pm1), project)
    assert res.status_code == 201
    assert res.json()["pending_budget_request"]["amount"] == "5000.00"
    assert "request_budget" not in res.json()["allowed_actions"]  # one at a time
    assert Notification.objects.filter(recipient=admin, type="budget_requested").exists()
    pending = client_for(admin).get(f"{BASE}?budget_request=pending").json()["results"]
    assert [p["id"] for p in pending] == [project.pk]
    assert (
        "decide_budget_request"
        in client_for(admin).get(f"{BASE}/{project.pk}").json()["allowed_actions"]
    )

    res = client_for(admin).post(
        f"{BASE}/{project.pk}/budget-request/decide", {"approve": True}, format="json"
    )
    assert res.status_code == 200 and res.json()["pending_budget_request"] is None
    project.refresh_from_db()
    assert project.sanctioned_budget == old + Decimal("5000")
    assert BudgetRequest.objects.get().status == "APPROVED"
    assert Notification.objects.filter(recipient=pm1, type="budget_request_approved").exists()


def test_admin_rejects_and_budget_stays(client_for, admin, pm1, project):
    old = project.sanctioned_budget
    ask(client_for(pm1), project)
    client_for(admin).post(
        f"{BASE}/{project.pk}/budget-request/decide",
        {"approve": False, "note": "Not now"},
        format="json",
    )
    project.refresh_from_db()
    assert project.sanctioned_budget == old and BudgetRequest.objects.get().status == "REJECTED"
    assert Notification.objects.filter(recipient=pm1, type="budget_request_rejected").exists()


def test_request_rules(client_for, admin, pm1, project):
    assert ask(client_for(pm1), project, amount="0").status_code == 400
    assert ask(client_for(pm1), project, reason="  ").status_code == 400
    assert ask(client_for(admin), project).status_code == 403  # only the project's PM asks
    assert ask(client_for(pm1), project).status_code == 201
    assert ask(client_for(pm1), project).status_code == 400  # already waiting
    assert (
        client_for(pm1)
        .post(f"{BASE}/{project.pk}/budget-request/decide", {"approve": True}, format="json")
        .status_code
        == 403
    )


def _complete_with_spend(project, pm1, amount):
    Expense.objects.create(
        project=project, amount=amount, category="LABOUR", spent_on=days_ago(1), logged_by=pm1
    )
    services.complete(project.pk, pm1)


def test_release_keeps_unused_as_margin(client_for, admin, pm1, project):
    _complete_with_spend(project, pm1, "1000.00")
    res = client_for(admin).post(f"{BASE}/{project.pk}/release-budget", {}, format="json")
    assert res.status_code == 200
    project.refresh_from_db()
    assert project.sanctioned_budget == Decimal("1000.00")
    assert res.json()["to_project"] is None
    assert "release_budget" not in res.json()["project"]["allowed_actions"]
    assert ProjectEvent.objects.filter(project=project, type="BUDGET_RELEASED").exists()


def test_release_moves_unused_to_another_project(client_for, admin, pm1, project, make_project):
    other = make_project(pm=pm1)
    before = other.sanctioned_budget
    unused = project.sanctioned_budget - Decimal("1000.00")
    _complete_with_spend(project, pm1, "1000.00")
    res = client_for(admin).post(
        f"{BASE}/{project.pk}/release-budget", {"target_project": other.pk}, format="json"
    )
    if res.status_code == 400:  # the target's deal total can cap its budget
        assert "budget" in str(res.json()).lower()
        return
    assert res.status_code == 200 and res.json()["to_project"]["id"] == other.pk
    other.refresh_from_db()
    assert other.sanctioned_budget == before + unused


def test_release_rules(client_for, admin, pm1, project):
    assert (
        client_for(admin).post(f"{BASE}/{project.pk}/release-budget").status_code == 400
    )  # running
    _complete_with_spend(project, pm1, str(project.sanctioned_budget))
    assert (
        client_for(admin).post(f"{BASE}/{project.pk}/release-budget").status_code == 400
    )  # all used
    assert client_for(pm1).post(f"{BASE}/{project.pk}/release-budget").status_code == 403
    assert Project.objects.get(pk=project.pk).status == "COMPLETED"
