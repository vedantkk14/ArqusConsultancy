# ruff: noqa: E501
from datetime import UTC
from decimal import Decimal

import pytest

from apps.accounts import selectors
from apps.accounts.models import Ledger, LedgerEvent
from apps.projects.models import Project

from .conftest import LEDGERS


def code(res):
    return res.json()["error"]["code"]


def test_ledger_state_transitions():
    assert selectors.ledger_state(100, 0, False) == "AWAITING_FINALIZATION"
    assert selectors.ledger_state(100, 0, True) == "UNPAID"
    assert selectors.ledger_state(100, "0.01", True) == "PARTIAL"
    assert selectors.ledger_state(100, "99.99", True) == "PARTIAL"
    assert selectors.ledger_state(100, 100, True) == "PAID"
    assert selectors.ledger_state(100, 100, False) == "AWAITING_FINALIZATION"


def test_finalize_happy_path_notifies_the_exec_without_amounts(
    client_for, admin, sales_exec, make_ledger, notes
):
    ledger = make_ledger(finalize=False)
    res = client_for(admin).post(
        f"{LEDGERS}/{ledger.pk}/finalize",
        {"amount": "85000", "note": "Agreed on site"},
        format="json",
    )
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["state"] == "UNPAID" and body["total"] == "85000.00" and body["finalized"] is True
    assert body["finalize_note"] == "Agreed on site" and body["finalized_by"]["id"] == admin.pk
    assert "record_payment" in body["allowed_actions"] and "finalize" not in body["allowed_actions"]
    event = LedgerEvent.objects.get(ledger=ledger, type="FINALIZED")
    assert event.data["amount"] == "85000.00" and event.actor_id == admin.pk
    (uid, kind, payload), = [n for n in notes if n[1] == "deal_finalized"]  # fmt: skip
    assert uid == sales_exec.pk
    assert payload == {"lead_id": ledger.lead_id, "lead_name": ledger.lead.name}
    assert "85000" not in str(payload) and "amount" not in payload


def test_finalizing_twice_is_a_409(client_for, admin, make_ledger, notes):
    ledger = make_ledger(finalize=False)
    client = client_for(admin)
    assert (
        client.post(
            f"{LEDGERS}/{ledger.pk}/finalize", {"amount": "1000"}, format="json"
        ).status_code
        == 200
    )
    again = client.post(f"{LEDGERS}/{ledger.pk}/finalize", {"amount": "2000"}, format="json")
    assert again.status_code == 409 and code(again) == "already_finalized"
    assert Ledger.objects.get(pk=ledger.pk).total_amount == Decimal("1000.00")


@pytest.mark.parametrize(
    "amount",
    ["0", "0.00", "-1", "-0.01", 12.5, True, "1.234", "12345678901", "abc", "", "1e3", None],
)
def test_finalize_amount_validation_table(client_for, admin, make_ledger, amount):
    ledger = make_ledger(finalize=False)
    body = {"amount": amount} if amount is not None else {}
    res = client_for(admin).post(f"{LEDGERS}/{ledger.pk}/finalize", body, format="json")
    assert res.status_code == 400 and "amount" in res.json()["error"]["details"], amount
    assert Ledger.objects.get(pk=ledger.pk).finalized_at is None


@pytest.mark.parametrize("amount", ["1", "0.01", "1234567890.99"])
def test_finalize_amount_accepts_the_edges(client_for, admin, make_ledger, amount):
    ledger = make_ledger(finalize=False)
    assert (
        client_for(admin)
        .post(f"{LEDGERS}/{ledger.pk}/finalize", {"amount": amount}, format="json")
        .status_code
        == 200
    )


def test_finalize_records_the_business_date(admin, make_ledger, clock):
    from datetime import datetime

    clock.set(datetime(2026, 1, 10, 18, 40, tzinfo=UTC))  # 00:10 the next day in IST
    ledger = make_ledger()
    assert ledger.finalized_on.isoformat() == "2026-01-11"


# ---- Revise total ----------------------------------------------------------------------------------


def revise(client, ledger, amount, reason="Scope changed"):
    return client.post(
        f"{LEDGERS}/{ledger.pk}/revise-total", {"amount": amount, "reason": reason}, format="json"
    )


def test_revise_total_needs_a_reason_and_writes_an_event(client_for, admin, ledger):
    client = client_for(admin)
    assert (
        client.post(
            f"{LEDGERS}/{ledger.pk}/revise-total", {"amount": "120000"}, format="json"
        ).status_code
        == 400
    )
    assert revise(client, ledger, "120000", reason="").status_code == 400
    res = revise(client, ledger, "120000")
    assert res.status_code == 200 and res.json()["total"] == "120000.00"
    event = LedgerEvent.objects.get(ledger=ledger, type="TOTAL_REVISED")
    assert event.data == {"old": "100000.00", "new": "120000.00", "reason": "Scope changed"}


def test_revise_total_only_after_finalization(client_for, admin, make_ledger):
    ledger = make_ledger(finalize=False)
    res = revise(client_for(admin), ledger, "5000")
    assert res.status_code == 409 and code(res) == "not_finalized"


def test_revise_total_cannot_go_below_received(client_for, admin, ledger, make_payment):
    make_payment(ledger, "40000.00")
    client = client_for(admin)
    res = revise(client, ledger, "39999.99")
    assert res.status_code == 400 and code(res) == "total_below_received"
    assert res.json()["error"]["details"]["received"] == "40000.00"
    assert revise(client, ledger, "40000.00").status_code == 200  # exactly what was received: PAID
    assert client.get(f"{LEDGERS}/{ledger.pk}").json()["state"] == "PAID"


def test_revise_total_cannot_go_below_the_project_budget(client_for, admin, ledger):
    Project.objects.create(
        name="P", client_name="C", lead=ledger.lead, sanctioned_budget=Decimal("60000.00")
    )
    client = client_for(admin)
    res = revise(client, ledger, "59999.99")
    assert res.status_code == 400 and code(res) == "total_below_budget"
    assert res.json()["error"]["details"]["min_total"] == "60000.00"
    assert revise(client, ledger, "60000.00").status_code == 200
    assert not LedgerEvent.objects.filter(
        ledger=ledger, type="TOTAL_REVISED", data__new="59999.99"
    ).exists()


def test_revising_a_voided_payments_total_uses_only_active_payments(
    client_for, admin, ledger, make_payment
):
    from apps.accounts import services

    payment = make_payment(ledger, "40000.00")
    services.void_payment(payment.pk, admin, "typo")
    assert revise(client_for(admin), ledger, "1000").status_code == 200


def test_revise_amount_validation(client_for, admin, ledger):
    for bad in ("0", "-5", "abc", "1.234"):
        res = revise(client_for(admin), ledger, bad)
        assert res.status_code == 400 and "amount" in res.json()["error"]["details"], bad
    assert LEDGERS
