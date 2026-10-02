"""One scripted story, end to end, with the PM leak scan after every step.

lead created -> assigned -> Won -> (finalized) -> converted with a PM -> the PM and the admin add
expenses (never blocked, the PM never sees a budget; the admin sees remaining against the deal
total) -> the PM completes -> expenses locked -> the admin reopens -> completes again.
"""

from decimal import Decimal

from apps.leads import services as lead_services
from apps.projects import integrations

from .conftest import BASE, EXPENSES, LEAD_PHONE, TOTAL, assert_no_leak, expense_form


def test_the_whole_deal_flow(client_for, admin, pm1, sales_manager, sales_exec, notes):
    admin_api, pm_api, exec_api = client_for(admin), client_for(pm1), client_for(sales_exec)

    def pm_scan(project_id=None):
        """Everything a PM can read about this deal, scanned for finance and lead data."""
        urls = [BASE, f"{BASE}/summary", EXPENSES, f"{EXPENSES}/summary"]
        if project_id:
            urls += [
                f"{BASE}/{project_id}",
                f"{BASE}/{project_id}/events",
                f"{BASE}/{project_id}/expenses",
            ]
        for url in urls:
            assert_no_leak(pm_api.get(url))

    # 1. A lead comes in, is assigned to an exec and worked.
    created = client_for(sales_manager).post(
        "/api/v1/leads",
        {
            "name": "Client 1",
            "phone": LEAD_PHONE,
            "email": "client1@example.com",
            "source": "REFERRAL",
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    lead_id = created.json()["id"]
    assert (
        client_for(sales_manager)
        .post(f"/api/v1/leads/{lead_id}/assign", {"assigned_to": sales_exec.pk}, format="json")
        .status_code
        == 200
    )
    assert (
        exec_api.patch(
            f"/api/v1/leads/{lead_id}", {"proposed_amount": str(TOTAL)}, format="json"
        ).status_code
        == 200
    )
    for to in ("CONTACTED", "INTERESTED"):
        assert (
            exec_api.post(
                f"/api/v1/leads/{lead_id}/status", {"status": to}, format="json"
            ).status_code
            == 200
        )
    pm_scan()

    # 2. Not won yet: it cannot be converted.
    opp_id = created.json()["current_opportunity_id"]
    early = admin_api.post(BASE, {"opportunity": opp_id, "name": "Too early"}, format="json")
    assert early.status_code == 400 and early.json()["error"]["code"] == "not_won"

    # 3. Won. (Finalizing needs Dev C's accounts module: skipped while the adapter is missing.)
    won = exec_api.post(
        f"/api/v1/leads/{lead_id}/status",
        {"status": "WON", "proposed_amount": str(TOTAL)},
        format="json",
    )
    assert won.status_code == 200, won.content
    if integrations.accounts_ready():
        assert (
            admin_api.post(
                f"/api/v1/leads/{lead_id}/finalize", {"amount": str(TOTAL)}, format="json"
            ).status_code
            == 200
        )
    row = admin_api.get(f"{BASE}/convertible?lead={lead_id}").json()["results"][0]
    assert row["ineligible_reason"] is None and row["total_amount"] == "1000000.00"
    pm_scan()

    # 4. Converted and a PM assigned. No budget is entered: the deal total is the admin's budget.
    converted = admin_api.post(
        BASE, {"opportunity": opp_id, "name": "Turf ground", "pm": pm1.pk}, format="json"
    )
    assert converted.status_code == 201, converted.content
    pid = converted.json()["id"]
    assert (pm1.pk, "project_assigned") in [(u, k) for u, k, _ in notes]
    assert (
        admin_api.post(BASE, {"opportunity": opp_id, "name": "Again"}, format="json").status_code
        == 409
    )
    assert "total_budget" not in pm_api.get(f"{BASE}/{pid}").json()
    assert admin_api.get(f"{BASE}/{pid}").json()["total_budget"] == "1000000.00"
    pm_scan(pid)

    # 5. The PM logs expenses; the admin adds one too. Nothing is ever blocked.
    def spend(amount, **over):
        return pm_api.post(
            f"{BASE}/{pid}/expenses", expense_form(amount=amount, **over), format="multipart"
        )

    assert spend("200000.00").status_code == 201
    assert spend("600000.00").status_code == 201
    assert (
        admin_api.post(
            f"{BASE}/{pid}/expenses", expense_form(amount="5000.00"), format="multipart"
        ).status_code
        == 201
    )
    assert [k for _, k, _ in notes if k.startswith("budget_")] == []  # no budget alerts any more
    detail = admin_api.get(f"{BASE}/{pid}").json()
    assert detail["spent"] == "805000.00" and detail["remaining"] == "195000.00"
    assert detail["state"] == "warn" and detail["usage_pct"] == "80.50"
    assert pm_api.get(f"{BASE}/{pid}").json()["spent"] == "805000.00"
    pm_scan(pid)

    # 8. The PM completes: expenses are locked for everyone.
    assert pm_api.post(f"{BASE}/{pid}/complete").json()["status"] == "COMPLETED"
    locked = spend("1.00")
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "project_completed"
    assert (
        admin_api.post(f"{BASE}/{pid}/expenses", expense_form(), format="multipart").status_code
        == 409
    )
    listed = pm_api.get(f"{EXPENSES}?project={pid}").json()["results"]
    assert listed and all(e["can_edit"] is False for e in listed)
    assert pm_api.get(f"{BASE}/{pid}").json()["allowed_actions"] == []
    pm_scan(pid)

    # 9. Reopened by the admin (with a reason), the PM can work again, then completes once more.
    assert pm_api.post(f"{BASE}/{pid}/reopen", {"reason": "x"}, format="json").status_code == 403
    assert (
        admin_api.post(
            f"{BASE}/{pid}/reopen", {"reason": "Snagging list"}, format="json"
        ).status_code
        == 200
    )
    assert (pm1.pk, "project_reopened") in [(u, k) for u, k, _ in notes]
    assert spend("1000.00").status_code == 201
    assert pm_api.post(f"{BASE}/{pid}/complete").status_code == 200
    pm_scan(pid)

    # 10. The books: spent adds up, the timeline tells the story, the finance block is admin-only.
    final = admin_api.get(f"{BASE}/{pid}").json()
    assert final["spent"] == "806000.00" and Decimal(final["remaining"]) == Decimal("194000.00")
    assert final["finance"] is None or final["finance"]["total_amount"] == str(TOTAL)
    types = [e["type"] for e in pm_api.get(f"{BASE}/{pid}/events?page_size=50").json()["results"]]
    assert types[0] == "COMPLETED" and types[-1] == "CREATED"
    for expected in ("REOPENED", "EXPENSE_ADDED"):
        assert expected in types
    assert lead_services  # the leads module drove the deal
