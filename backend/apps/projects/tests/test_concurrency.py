"""Two parallel expenses must never jointly overspend. Needs row locks: MySQL or PostgreSQL."""

import threading
from decimal import Decimal

import pytest
from django.db import connection, connections

from apps.projects import selectors, services
from apps.projects.exceptions import OverBudget
from apps.projects.models import Expense

pytestmark = pytest.mark.skipif(
    connection.vendor not in ("mysql", "postgresql"), reason="row locks need MySQL or PostgreSQL"
)


def spend(project_id, user, amount, results, barrier):
    try:
        barrier.wait(timeout=10)
        services.add_expense(
            project_id,
            user,
            {
                "amount": Decimal(amount),
                "category": "LABOUR",
                "spent_on": selectors.business_today(),
            },
        )
        results.append("ok")
    except OverBudget:
        results.append("over_budget")
    except Exception as exc:  # noqa: BLE001 - the test reports whatever went wrong
        results.append(repr(exc))
    finally:
        connections.close_all()


@pytest.mark.django_db(transaction=True)
def test_parallel_expenses_cannot_jointly_overspend(admin, pm1, make_project):
    project = make_project(pm=pm1, budget="100.00")
    results: list[str] = []
    barrier = threading.Barrier(2)
    threads = [
        threading.Thread(target=spend, args=(project.pk, pm1, "60.00", results, barrier))
        for _ in range(2)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    assert sorted(results) == ["ok", "over_budget"], results
    assert selectors.spent_for(project) == Decimal("60.00")
    assert Expense.objects.filter(project=project).count() == 1


@pytest.mark.django_db(transaction=True)
def test_many_parallel_expenses_stay_within_the_budget(admin, pm1, make_project):
    project = make_project(pm=pm1, budget="100.00")
    results: list[str] = []
    barrier = threading.Barrier(6)
    threads = [
        threading.Thread(target=spend, args=(project.pk, pm1, "30.00", results, barrier))
        for _ in range(6)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert results.count("ok") == 3 and results.count("over_budget") == 3, results
    assert selectors.spent_for(project) == Decimal("90.00") <= project.sanctioned_budget
