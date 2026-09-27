# ruff: noqa: E501
"""Two parallel payments must never overpay. Needs row locks: MySQL or PostgreSQL."""

import threading
from decimal import Decimal

import pytest
from django.db import connection, connections

from apps.accounts import selectors, services
from apps.accounts.exceptions import DuplicatePayment, Overpayment
from apps.accounts.models import Payment

pytestmark = pytest.mark.skipif(
    connection.vendor not in ("mysql", "postgresql"), reason="row locks need MySQL or PostgreSQL"
)


def pay(ledger_id, user, amount, reference, results, barrier):
    try:
        barrier.wait(timeout=10)
        services.add_payment(
            ledger_id,
            user,
            {
                "amount": Decimal(amount),
                "mode": "UPI",
                "reference": reference,
                "received_on": selectors.business_today(),
            },
        )
        results.append("ok")
    except Overpayment:
        results.append("overpayment")
    except DuplicatePayment:
        results.append("duplicate")
    except Exception as exc:  # noqa: BLE001 - the test reports whatever went wrong
        results.append(repr(exc))
    finally:
        connections.close_all()


def run(ledger, admin, amount, refs):
    results: list[str] = []
    barrier = threading.Barrier(len(refs))
    threads = [
        threading.Thread(target=pay, args=(ledger.pk, admin, amount, ref, results, barrier))
        for ref in refs
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    return results


@pytest.mark.django_db(transaction=True)
def test_parallel_payments_cannot_overpay(admin, make_ledger):
    ledger = make_ledger(total="100.00")
    results = run(ledger, admin, "60.00", ["A", "B"])
    assert sorted(results) == ["ok", "overpayment"], results
    assert selectors.received_for(ledger) == Decimal("60.00")
    assert Payment.objects.filter(ledger=ledger).count() == 1


@pytest.mark.django_db(transaction=True)
def test_many_parallel_payments_stay_within_the_total(admin, make_ledger):
    ledger = make_ledger(total="100.00")
    results = run(ledger, admin, "30.00", [f"R{i}" for i in range(6)])
    assert results.count("ok") == 3 and results.count("overpayment") == 3, results
    assert selectors.received_for(ledger) == Decimal("90.00") <= ledger.total_amount


@pytest.mark.django_db(transaction=True)
def test_parallel_identical_payments_are_caught_as_duplicates(admin, make_ledger):
    ledger = make_ledger(total="1000.00")
    results = run(ledger, admin, "10.00", ["SAME", "SAME", "SAME"])
    assert results.count("ok") == 1 and results.count("duplicate") == 2, results
