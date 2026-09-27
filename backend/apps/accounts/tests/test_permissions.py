# ruff: noqa: E501
"""Everything in Accounts is ADMIN only: 401 anonymous, 403 for every other role, bodies without amounts.

The one exception: SALES_MANAGER may finalize a won deal (POST /ledgers/{id}/finalize); revise-total,
payments, void and everything else stay 403 for them.
"""

import re

import pytest

from .conftest import LEDGERS, PAYMENTS, payment_form


@pytest.fixture
def world(ledger, make_payment):
    return {"ledger": ledger, "payment": make_payment(ledger, "12345.67", reference="UTR-LEAK")}


def endpoints(w):
    ledger, payment = w["ledger"].pk, w["payment"].pk
    return [
        ("get", LEDGERS, None),
        ("get", f"{LEDGERS}/summary", None),
        ("get", f"{LEDGERS}/options", None),
        ("get", f"{LEDGERS}/export", None),
        ("get", f"{LEDGERS}/{ledger}", None),
        ("post", f"{LEDGERS}/{ledger}/finalize", {"amount": "1000"}),
        ("post", f"{LEDGERS}/{ledger}/revise-total", {"amount": "1000", "reason": "r"}),
        ("post", f"{LEDGERS}/{ledger}/reminder", {}),
        ("get", f"{LEDGERS}/{ledger}/payments", None),
        ("post", f"{LEDGERS}/{ledger}/payments", "form"),
        ("get", f"{LEDGERS}/{ledger}/events", None),
        ("get", f"{LEDGERS}/{ledger}/statement", None),
        ("get", f"{LEDGERS}/{ledger}/statement?format=csv", None),
        ("get", PAYMENTS, None),
        ("get", f"{PAYMENTS}/summary", None),
        ("get", f"{PAYMENTS}/export", None),
        ("get", f"{PAYMENTS}/{payment}", None),
        ("post", f"{PAYMENTS}/{payment}/void", {"reason": "r"}),
        ("get", f"{PAYMENTS}/{payment}/proof", None),
    ]


def call(client, method, url, body):
    if body == "form":
        return client.post(url, payment_form(), format="multipart")
    if method == "get":
        return client.get(url)
    return getattr(client, method)(url, body, format="json")


def test_anonymous_gets_401_everywhere(client_for, world):
    for method, url, body in endpoints(world):
        assert call(client_for(), method, url, body).status_code == 401, (method, url)


@pytest.mark.parametrize("role", ["sales_manager", "sales_exec", "pm"])
def test_every_other_role_gets_403_everywhere_with_no_amounts_in_the_body(
    client_for, world, request, role
):
    user = request.getfixturevalue(role)
    for method, url, body in endpoints(world):
        if role == "sales_manager" and url.endswith("/finalize"):
            continue  # the Sales Manager's one accounts action (tested below)
        res = call(client_for(user), method, url, body)
        assert res.status_code == 403, (role, method, url)
        text = res.content.decode() if hasattr(res, "content") and not res.streaming else ""
        assert not re.search(r"\d{4,}\.\d\d|12345|100000|UTR-LEAK", text), (role, url, text[:120])
        assert set(res.json()["error"]) == {"code", "message", "details"}


def test_nothing_changed_after_the_forbidden_writes(client_for, sales_manager, world):
    from apps.accounts.models import Ledger, Payment

    for method, url, body in endpoints(world):
        if method == "post":
            call(client_for(sales_manager), method, url, body)
    ledger = Ledger.objects.get(pk=world["ledger"].pk)
    assert (
        ledger.total_amount == 100000
        and Payment.objects.count() == 1
        and Payment.objects.get().is_void is False
    )


def test_sales_manager_finalizes_but_nothing_else(client_for, sales_manager, make_ledger, notes):
    from apps.accounts.models import Ledger

    open_ledger = make_ledger(finalize=False)
    c = client_for(sales_manager)
    res = c.post(f"{LEDGERS}/{open_ledger.pk}/finalize", {"amount": "90000"}, format="json")
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["finalized"] is True and body["total"] == "90000.00"
    assert not {"received", "outstanding", "payments", "project", "state"} & set(body)
    assert Ledger.objects.get(pk=open_ledger.pk).finalized_by_id == sales_manager.pk
    assert [k for _, k, _ in notes] == ["deal_finalized"]  # the exec is told, as for an admin
    again = c.post(f"{LEDGERS}/{open_ledger.pk}/finalize", {"amount": "1"}, format="json")
    assert again.status_code == 409
    forbidden = [
        ("post", f"{LEDGERS}/{open_ledger.pk}/revise-total", {"amount": "95000", "reason": "r"}),
        ("post", f"{LEDGERS}/{open_ledger.pk}/payments", "form"),
        ("get", f"{LEDGERS}/{open_ledger.pk}/payments", None),
        ("get", f"{LEDGERS}/{open_ledger.pk}", None),
    ]
    for method, url, payload in forbidden:
        assert call(c, method, url, payload).status_code == 403, url
    assert Ledger.objects.get(pk=open_ledger.pk).total_amount == 90000


def test_sales_manager_cannot_void(client_for, sales_manager, world):
    res = client_for(sales_manager).post(
        f"{PAYMENTS}/{world['payment'].pk}/void", {"reason": "r"}, format="json"
    )
    assert res.status_code == 403


def test_admin_can_use_every_read_endpoint(client_for, admin, world):
    for method, url, body in endpoints(world):
        if method == "get" and not url.endswith("/proof"):
            assert call(client_for(admin), method, url, body).status_code == 200, url


def test_unknown_ids_are_404_for_the_admin(client_for, admin):
    c = client_for(admin)
    assert c.get(f"{LEDGERS}/999999").status_code == 404
    assert c.get(f"{PAYMENTS}/999999").status_code == 404
    assert c.post(f"{LEDGERS}/999999/finalize", {"amount": "1"}, format="json").status_code == 404


def test_leads_exec_screens_carry_no_ledger_data(client_for, sales_exec, ledger, make_payment):
    make_payment(ledger, "12345.67")
    res = client_for(sales_exec).get(f"/api/v1/leads/{ledger.opportunity.lead_id}")
    assert res.status_code == 200
    text = res.content.decode()
    for needle in ("received", "outstanding", "12345.67", "ledger", "payment"):
        assert needle not in text.lower(), needle
