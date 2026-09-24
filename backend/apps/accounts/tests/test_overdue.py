# ruff: noqa: E501
"""Overdue and aging with a patched clock: `selectors.now()` is the only source of "today"."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from django.core.management import call_command

from apps.accounts import selectors
from apps.accounts.management.commands import notify_overdue_payments as command
from apps.accounts.models import Ledger

from .conftest import LEDGERS, payment_form

NOON = datetime(2026, 6, 15, 6, 30, tzinfo=UTC)  # noon in IST


@pytest.fixture(autouse=True)
def fixed_now(clock):
    clock.set(NOON)
    return clock


def base_days(ledger, days):
    """Pretend the ledger was finalized `days` business days before the (patched) today."""
    day = selectors.business_today() - timedelta(days=days)
    Ledger.objects.filter(pk=ledger.pk).update(finalized_on=day)
    return Ledger.objects.get(pk=ledger.pk)


def row(client, ledger):
    return next(r for r in client.get(LEDGERS).json()["results"] if r["id"] == ledger.pk)


@pytest.mark.parametrize(
    "days, overdue, bucket",
    [
        (0, False, "0-30"),
        (30, False, "0-30"),
        (31, True, "31-60"),
        (60, True, "31-60"),
        (61, True, "61-90"),
        (90, True, "61-90"),
        (91, True, "90+"),
        (400, True, "90+"),
    ],
)
def test_the_30_31_day_boundary_and_every_bucket(
    client_for, admin, make_ledger, days, overdue, bucket
):
    ledger = base_days(make_ledger(), days)
    client = client_for(admin)
    r = row(client, ledger)
    assert r["days_since"] == days and r["is_overdue"] is overdue
    assert selectors.bucket_for(days) == bucket
    ids = lambda q: [x["id"] for x in client.get(f"{LEDGERS}?{q}").json()["results"]]  # noqa: E731
    assert (ledger.pk in ids("overdue=true")) is overdue
    assert ledger.pk in ids(f"aging={bucket.replace('+', '%2B')}")
    others = [b for b in selectors.AGING_BUCKETS if b != bucket]
    for other in others:
        assert ledger.pk not in ids(f"aging={other.replace('+', '%2B')}")
    aging = client.get(f"{LEDGERS}/summary").json()["aging"]
    assert {b["bucket"]: b["count"] for b in aging}[bucket] == 1


def test_the_basis_is_the_last_active_payment_else_the_finalization_date(
    client_for, admin, make_ledger, make_payment
):
    from apps.accounts import services

    ledger = base_days(make_ledger(), 100)
    client = client_for(admin)
    assert row(client, ledger)["days_since"] == 100 and row(client, ledger)["is_overdue"] is True
    payment = make_payment(ledger, "1000.00", days_ago=10)
    r = row(client, ledger)
    assert (
        r["days_since"] == 10
        and r["is_overdue"] is False
        and r["last_payment_on"] == (selectors.business_today() - timedelta(days=10)).isoformat()
    )
    services.void_payment(payment.pk, admin, "typo")  # a void payment no longer counts
    assert row(client, ledger)["days_since"] == 100


def test_unfinalized_and_fully_paid_ledgers_are_never_overdue(
    client_for, admin, make_ledger, make_payment
):
    open_ledger = make_ledger(finalize=False)
    paid = base_days(make_ledger(), 200)
    make_payment(paid, "100000.00", days_ago=80)
    client = client_for(admin)
    assert (
        row(client, open_ledger)["is_overdue"] is False
        and row(client, open_ledger)["days_since"] is None
    )
    assert row(client, paid)["is_overdue"] is False
    summary = client.get(f"{LEDGERS}/summary").json()
    assert (
        summary["overdue_clients"] == 0
        and summary["overdue_amount"] == "0.00"
        and summary["awaiting_finalization"] == 1
    )
    assert sum(b["count"] for b in summary["aging"]) == 0


def test_the_business_time_zone_midnight_edge(make_ledger, clock):
    clock.set(datetime(2026, 6, 15, 18, 29, tzinfo=UTC))  # 23:59 IST on the 15th
    assert selectors.business_today().isoformat() == "2026-06-15"
    clock.set(datetime(2026, 6, 15, 18, 31, tzinfo=UTC))  # 00:01 IST on the 16th
    assert selectors.business_today().isoformat() == "2026-06-16"
    assert (
        selectors.days_since(datetime(2026, 5, 16).date()) == 31
    )  # overdue only from that minute on
    assert selectors.is_overdue(True, Decimal("1"), datetime(2026, 5, 16).date()) is True
    clock.set(datetime(2026, 6, 15, 18, 29, tzinfo=UTC))
    assert selectors.is_overdue(True, Decimal("1"), datetime(2026, 5, 16).date()) is False


def test_summary_top_overdue_and_collection_rate(
    client_for, admin, make_ledger, make_payment, make_lead
):
    a = base_days(make_ledger(lead=make_lead(name="Alpha")), 45)
    b = base_days(make_ledger(lead=make_lead(name="Bravo")), 120)
    c = base_days(make_ledger(lead=make_lead(name="Charlie")), 33)
    d = base_days(make_ledger(lead=make_lead(name="Delta")), 500)
    make_payment(d, "100000.00", days_ago=1)  # paid: not in the list
    make_payment(c, "50000.00", days_ago=40)
    summary = client_for(admin).get(f"{LEDGERS}/summary").json()
    assert [t["client"] for t in summary["top_overdue"]] == ["Bravo", "Alpha", "Charlie"]
    assert summary["top_overdue"][0] == {
        "ledger": b.pk,
        "client": "Bravo",
        "outstanding": "100000.00",
        "days_since": 120,
    }
    assert summary["total_value"] == "400000.00" and summary["received"] == "150000.00"
    assert summary["outstanding"] == "250000.00" and summary["collection_rate_pct"] == "37.5"
    assert summary["overdue_amount"] == "250000.00" and summary["overdue_clients"] == 3
    assert summary["clients_with_balance"] == 3 and a.pk


# ---- The management command ------------------------------------------------------------------------


def test_notify_overdue_payments_is_idempotent_and_reset_by_a_new_payment(
    admin, admin2, make_ledger, make_payment, monkeypatch
):
    calls = []
    monkeypatch.setattr(
        command, "notify", lambda user, type_, payload: calls.append((user.pk, type_, payload))
    )
    ledger = base_days(make_ledger(), 45)
    fresh = base_days(make_ledger(), 10)
    assert command.notify_overdue_payments() == 1
    assert sorted(uid for uid, kind, _ in calls if kind == "payment_overdue") == sorted(
        [admin.pk, admin2.pk]
    )
    payload = calls[0][2]
    assert (
        payload["ledger_id"] == ledger.pk
        and payload["days_since"] == 45
        and "amount" not in payload
    )
    assert command.notify_overdue_payments() == 0  # already announced
    assert Ledger.objects.get(pk=ledger.pk).overdue_notified_at is not None
    make_payment(ledger, "1000.00", days_ago=0)  # a payment resets it
    assert Ledger.objects.get(pk=ledger.pk).overdue_notified_at is None
    assert command.notify_overdue_payments() == 0  # no longer overdue
    Ledger.objects.filter(pk=ledger.pk).update(
        finalized_on=selectors.business_today() - timedelta(days=200)
    )
    from apps.accounts.models import Payment

    Payment.objects.filter(ledger=ledger).update(
        received_on=selectors.business_today() - timedelta(days=40)
    )
    assert command.notify_overdue_payments() == 1  # overdue again, announced again
    assert fresh.pk


def test_the_command_runs_from_manage_py(admin, make_ledger, capsys):
    base_days(make_ledger(), 45)
    call_command("notify_overdue_payments")
    assert "Announced 1 overdue ledger(s)." in capsys.readouterr().out
    assert payment_form()
