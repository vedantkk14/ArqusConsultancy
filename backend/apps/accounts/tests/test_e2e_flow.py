# ruff: noqa: E501
"""One scripted story: won -> finalized -> project -> payments -> PAID -> void -> revise -> overdue -> statement.

After every step the Exec's lead response and the PM's project responses must carry no ledger data.
"""

from datetime import timedelta
from decimal import Decimal

from apps.accounts import selectors
from apps.accounts.models import Ledger

from .conftest import LEAD_PHONE, LEDGERS, PAYMENTS, payment_form

BASE = "/api/v1"
LEAK = (
    "received",
    "outstanding",
    "ledger",
    "payment",
    "total_amount",
    "collected",
    "receipt",
    "finaliz",
)


def test_the_whole_deal_flow(
    client_for, admin, admin2, sales_manager, sales_exec, pm, notes, clock, make_user
):
    admin_api, exec_api, pm_api = client_for(admin), client_for(sales_exec), client_for(pm)

    def no_ledger_data(lead_id, project_id=None):
        """The exec's lead and the PM's project must not carry ledger data (amounts, payments, finalization)."""
        body = exec_api.get(f"{BASE}/leads/{lead_id}").content.decode().lower()
        for needle in LEAK:
            assert needle not in body, f"exec lead response has {needle!r}"
        assert "60000" not in body and "84000" not in body
        if project_id:
            for url in (
                f"{BASE}/projects/{project_id}",
                f"{BASE}/projects/{project_id}/events",
                f"{BASE}/projects",
            ):
                text = pm_api.get(url).content.decode().lower()
                for needle in (
                    "total_amount",
                    "received",
                    "outstanding",
                    "ledger",
                    "payment",
                    "margin",
                    "finance",
                ):
                    assert needle not in text, f"pm response {url} has {needle!r}"

    # 1. A lead is created, assigned and worked up to Won: the ledger appears, unfinalized.
    created = client_for(sales_manager).post(
        f"{BASE}/leads",
        {"name": "Client 1", "phone": LEAD_PHONE, "source": "REFERRAL"},
        format="json",
    )
    lead_id = created.json()["id"]
    client_for(sales_manager).post(
        f"{BASE}/leads/{lead_id}/assign", {"assigned_to": sales_exec.pk}, format="json"
    )
    exec_api.patch(f"{BASE}/leads/{lead_id}", {"proposed_amount": "100000"}, format="json")
    for to in ("CONTACTED", "INTERESTED"):
        exec_api.post(f"{BASE}/leads/{lead_id}/status", {"status": to}, format="json")
    won = exec_api.post(
        f"{BASE}/leads/{lead_id}/status",
        {"status": "WON", "proposed_amount": "100000"},
        format="json",
    )
    assert won.status_code == 200, won.content
    ledger = Ledger.objects.get(lead_id=lead_id)
    detail = admin_api.get(f"{LEDGERS}/{ledger.pk}").json()
    assert detail["state"] == "AWAITING_FINALIZATION" and detail["total"] == "100000.00"
    no_ledger_data(lead_id)

    # 2. A payment before finalization is blocked.
    blocked = admin_api.post(
        f"{LEDGERS}/{ledger.pk}/payments", payment_form(amount="1000"), format="multipart"
    )
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "not_finalized", (
        blocked.content
    )
    assert (
        client_for(admin)
        .post(
            f"{BASE}/projects",
            {"lead": lead_id, "name": "P", "sanctioned_budget": "1"},
            format="json",
        )
        .json()["error"]["code"]
        == "not_finalized"
    )

    # 3. Finalized with a different total: the exec is told, without an amount.
    notes.clear()
    fin = admin_api.post(
        f"{LEDGERS}/{ledger.pk}/finalize",
        {"amount": "84000", "note": "Negotiated down"},
        format="json",
    )
    assert fin.status_code == 200 and fin.json()["total"] == "84000.00"
    assert [(u, k, p) for u, k, p in notes if k == "deal_finalized"] == [
        (sales_exec.pk, "deal_finalized", {"lead_id": lead_id, "lead_name": "Client 1"})
    ]
    no_ledger_data(lead_id)

    # 4. Converted to a project: the budget is capped by the finalized total (not the proposal).
    too_much = admin_api.post(
        f"{BASE}/projects",
        {"lead": lead_id, "name": "Turf", "sanctioned_budget": "84000.01", "pm": pm.pk},
        format="json",
    )
    assert (
        too_much.status_code == 400 and too_much.json()["error"]["code"] == "budget_exceeds_total"
    )
    ok = admin_api.post(
        f"{BASE}/projects",
        {"lead": lead_id, "name": "Turf", "sanctioned_budget": "60000", "pm": pm.pk},
        format="json",
    )
    assert ok.status_code == 201, ok.content
    project_id = ok.json()["id"]
    assert ok.json()["finance"]["total_amount"] == "84000.00"
    no_ledger_data(lead_id, project_id)
    below = admin_api.post(
        f"{LEDGERS}/{ledger.pk}/revise-total", {"amount": "59999", "reason": "cut"}, format="json"
    )
    assert below.status_code == 400 and below.json()["error"]["code"] == "total_below_budget"

    # 5. A 30% advance, then a partial payment.
    advance = admin_api.post(
        f"{LEDGERS}/{ledger.pk}/payments",
        payment_form(amount="25200", reference="UTR-ADV"),
        format="multipart",
    )
    assert advance.status_code == 201
    assert admin_api.get(f"{LEDGERS}/{ledger.pk}").json()["state"] == "PARTIAL"
    admin_api.post(
        f"{LEDGERS}/{ledger.pk}/payments",
        payment_form(amount="30000", mode="UPI", reference="UPI-2"),
        format="multipart",
    )
    detail = admin_api.get(f"{LEDGERS}/{ledger.pk}").json()
    assert (
        detail["received"] == "55200.00"
        and detail["outstanding"] == "28800.00"
        and detail["state"] == "PARTIAL"
    )
    assert (
        detail["project"]["live_margin"] == "55200.00"
        and detail["project"]["planned_margin"] == "24000.00"
    )
    no_ledger_data(lead_id, project_id)

    # 6. Overpayment is blocked; the exact balance completes the ledger.
    over = admin_api.post(
        f"{LEDGERS}/{ledger.pk}/payments",
        payment_form(amount="28800.01", reference="UTR-X"),
        format="multipart",
    )
    assert over.status_code == 409 and over.json()["error"]["details"] == {
        "outstanding": "28800.00"
    }
    balance = admin_api.post(
        f"{LEDGERS}/{ledger.pk}/payments",
        payment_form(amount="28800", mode="CASH", reference=None),
        format="multipart",
    )
    assert balance.status_code == 201
    assert admin_api.get(f"{LEDGERS}/{ledger.pk}").json()["state"] == "PAID"
    assert admin_api.get(f"{LEDGERS}/summary").json()["clients_with_balance"] == 0

    # 7. Voiding the last payment restores the balance.
    voided = admin_api.post(
        f"{PAYMENTS}/{balance.json()['id']}/void", {"reason": "Counted twice"}, format="json"
    )
    assert voided.status_code == 200
    detail = admin_api.get(f"{LEDGERS}/{ledger.pk}").json()
    assert detail["state"] == "PARTIAL" and detail["outstanding"] == "28800.00"
    no_ledger_data(lead_id, project_id)

    # 8. The total is revised up; the outstanding grows with it.
    revised = admin_api.post(
        f"{LEDGERS}/{ledger.pk}/revise-total",
        {"amount": "90000", "reason": "Extra floodlights"},
        format="json",
    )
    assert revised.status_code == 200
    detail = admin_api.get(f"{LEDGERS}/{ledger.pk}").json()
    assert detail["total"] == "90000.00" and detail["outstanding"] == "34800.00"

    # 9. Time passes: 31 days after the last payment the ledger is overdue, in the 31-60 bucket.
    clock.set(selectors.now() + timedelta(days=31))
    row = next(
        r
        for r in admin_api.get(f"{LEDGERS}?overdue=true").json()["results"]
        if r["id"] == ledger.pk
    )
    assert row["is_overdue"] is True and row["days_since"] == 31
    summary = admin_api.get(f"{LEDGERS}/summary").json()
    assert summary["overdue_clients"] == 1 and summary["overdue_amount"] == "34800.00"
    assert {b["bucket"]: b["count"] for b in summary["aging"]}["31-60"] == 1
    assert summary["top_overdue"][0]["ledger"] == ledger.pk

    # 10. A reminder is prepared, then the statement adds up.
    reminder = admin_api.post(f"{LEDGERS}/{ledger.pk}/reminder")
    assert (
        reminder.status_code == 200
        and "₹34,800.00" in reminder.json()["text"]
        and reminder.json()["url"].startswith("https://wa.me/919812345678")
    )
    statement = admin_api.get(f"{LEDGERS}/{ledger.pk}/statement").json()
    assert statement["total_amount"] == "90000.00"
    assert [r["credit"] for r in statement["rows"]] == ["25200.00", "30000.00"]
    assert statement["credit_total"] == "55200.00" and statement["closing_balance"] == "34800.00"
    assert Decimal(statement["closing_balance"]) == Decimal(detail["outstanding"])
    no_ledger_data(lead_id, project_id)
    assert admin2 and make_user
