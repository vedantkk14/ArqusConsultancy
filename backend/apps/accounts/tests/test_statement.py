# ruff: noqa: E501
"""Statements and receipts: correct figures, and never any sanctioned budget, expenses or margin."""

import csv
import io
from datetime import timedelta
from decimal import Decimal

import pytest

from apps.accounts import selectors, services
from apps.projects.models import Expense, Project

from .conftest import BUDGET, LEAD_PHONE, LEDGERS, PAYMENTS

FORBIDDEN_KEYS = (
    "sanction",
    "budget",
    "expense",
    "margin",
    "spent",
    "notes",
    "exec",
    "proposed",
    "commission",
)


def keys(payload, path="$"):
    found = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            if any(bad in str(key).lower() for bad in FORBIDDEN_KEYS):
                found.append(f"{path}.{key}")
            found += keys(value, f"{path}.{key}")
    elif isinstance(payload, list):
        for i, item in enumerate(payload):
            found += keys(item, f"{path}[{i}]")
    return found


@pytest.fixture
def deal(admin, make_ledger, make_payment):
    """A ledger with a linked project (budget 60,000, an expense) and three payments plus one void."""
    ledger = make_ledger()
    project = Project.objects.create(
        name="Turf", client_name="C", lead=ledger.lead, sanctioned_budget=Decimal(BUDGET)
    )
    Expense.objects.create(
        project=project,
        amount=Decimal("12345.67"),
        category="LABOUR",
        spent_on=selectors.business_today(),
    )
    make_payment(ledger, "20000.00", mode="BANK_TRANSFER", reference="UTR1", days_ago=40)
    make_payment(ledger, "30000.00", mode="UPI", reference="UPI2", days_ago=20)
    make_payment(ledger, "10000.00", mode="CASH", days_ago=5)
    bad = make_payment(ledger, "9999.00", mode="CARD", reference="C1", days_ago=3)
    services.void_payment(bad.pk, admin, "typo")
    return ledger


def test_statement_lists_active_payments_with_a_running_balance(client_for, admin, deal):
    s = client_for(admin).get(f"{LEDGERS}/{deal.pk}/statement").json()
    assert s["total_amount"] == "100000.00" and s["opening_balance"] == "100000.00"
    assert [(r["credit"], r["balance"]) for r in s["rows"]] == [
        ("20000.00", "80000.00"),
        ("30000.00", "50000.00"),
        ("10000.00", "40000.00"),
    ]
    assert (
        s["rows"][0]["particulars"] == "Bank transfer UTR1"
        and s["rows"][2]["particulars"] == "Cash"
    )
    assert s["credit_total"] == "60000.00" and s["closing_balance"] == "40000.00"
    assert s["client"]["name"] == deal.lead.name and s["finalized"] is True


def test_statement_period_carries_an_opening_balance(client_for, admin, deal):
    today = selectors.business_today()
    frm = (today - timedelta(days=25)).isoformat()
    s = client_for(admin).get(f"{LEDGERS}/{deal.pk}/statement?from={frm}").json()
    assert s["opening_balance"] == "80000.00"  # the 20,000 paid before the period
    assert [r["credit"] for r in s["rows"]] == ["30000.00", "10000.00"] and s[
        "closing_balance"
    ] == "40000.00"
    to = (today - timedelta(days=30)).isoformat()
    only_first = client_for(admin).get(f"{LEDGERS}/{deal.pk}/statement?to={to}").json()
    assert [r["credit"] for r in only_first["rows"]] == ["20000.00"] and only_first[
        "closing_balance"
    ] == "80000.00"
    bad = client_for(admin).get(
        f"{LEDGERS}/{deal.pk}/statement?from={today}&to={today - timedelta(days=1)}"
    )
    assert bad.status_code == 400


def test_statement_needs_a_finalized_ledger(client_for, admin, make_ledger):
    ledger = make_ledger(finalize=False)
    assert client_for(admin).get(f"{LEDGERS}/{ledger.pk}/statement").status_code == 400


def test_statement_csv(client_for, admin, deal):
    res = client_for(admin).get(f"{LEDGERS}/{deal.pk}/statement?format=csv")
    assert res.status_code == 200 and res["Content-Type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(res.content.decode("utf-8-sig"))))
    assert rows[0] == ["Date", "Receipt", "Particulars", "Credit", "Balance"]
    assert rows[1][2] == "Deal total" and rows[1][4] == "100000.00"
    assert [r[3] for r in rows[2:5]] == ["20000.00", "30000.00", "10000.00"] and rows[-1][
        3
    ] == "60000.00"


def test_statement_never_leaks_budget_expenses_margin_or_exec_data(client_for, admin, deal):
    c = client_for(admin)
    json_res = c.get(f"{LEDGERS}/{deal.pk}/statement")
    assert keys(json_res.json()) == []
    csv_res = c.get(f"{LEDGERS}/{deal.pk}/statement?format=csv")
    for res in (json_res, csv_res):
        raw = res.content.decode("utf-8-sig").lower()
        for needle in (
            "61234",
            "12345.67",
            "12,345",
            "margin",
            "sanction",
            "expense",
            "budget",
            "eva",
        ):
            assert needle not in raw, needle
    assert LEAD_PHONE in json_res.content.decode()  # the client's own contact is fine


def test_receipt_payload_has_everything_and_nothing_extra(client_for, admin, deal):
    payment = deal.payments.order_by("id").first()
    body = client_for(admin).get(f"{PAYMENTS}/{payment.pk}").json()
    assert (
        body["receipt_no"].endswith(f"{payment.pk:06d}")
        and body["amount_in_words"] == "Rupees Twenty Thousand Only"
    )
    assert body["balance_after"] == "80000.00" and body["company"] == "ARQUS Sports Consultancy"
    assert keys(body) == []
    third = deal.payments.filter(is_void=False).order_by("received_on", "id").last()
    assert client_for(admin).get(f"{PAYMENTS}/{third.pk}").json()["balance_after"] == "40000.00"
    void = deal.payments.filter(is_void=True).first()
    assert client_for(admin).get(f"{PAYMENTS}/{void.pk}").json()["balance_after"] is None
