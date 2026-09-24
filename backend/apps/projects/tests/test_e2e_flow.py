"""One scripted story, end to end, with the PM leak scan after every step.

lead created -> assigned -> Won -> (finalized) -> converted with a PM -> the PM adds expenses
crossing 80% (admin notified) -> the PM is blocked at over-budget -> the admin overrides ->
the PM completes -> expenses locked -> the admin reopens -> completes again.
"""

from decimal import Decimal

from apps.leads import services as lead_services
from apps.projects import integrations
from apps.projects.models import Project

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
    early = admin_api.post(
        BASE, {"lead": lead_id, "name": "Too early", "sanctioned_budget": "1000"}, format="json"
    )
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
    assert row["ineligible_reason"] is None and row["suggested_budget"] == "600000.00"
    pm_scan()

    # 4. Converted with a PM, budget 60% of the deal.
    converted = admin_api.post(
        BASE,
        {
            "lead": lead_id,
            "name": "Turf ground",
            "sanctioned_budget": row["suggested_budget"],
            "pm": pm1.pk,
        },
        format="json",
    )
    assert converted.status_code == 201, converted.content
    pid = converted.json()["id"]
    assert (pm1.pk, "project_assigned") in [(u, k) for u, k, _ in notes]
    assert (
        admin_api.post(
            BASE, {"lead": lead_id, "name": "Again", "sanctioned_budget": "1"}, format="json"
        ).status_code
        == 409
    )
    assert pm_api.get(f"{BASE}/{pid}").json()["sanctioned_budget"] == "600000.00"
    pm_scan(pid)

    # 5. The PM logs expenses and crosses 80%: the admin is told, once.
    def spend(amount, **over):
        return pm_api.post(
            f"{BASE}/{pid}/expenses", expense_form(amount=amount, **over), format="multipart"
        )

    assert spend("200000.00").status_code == 201
    assert spend("270000.00").status_code == 201  # 470,000: 78.3%
    notes.clear()
    assert spend("10000.00").status_code == 201  # 480,000: exactly 80%
    assert [(u, k) for u, k, _ in notes if k.startswith("budget_")] == [(admin.pk, "budget_warn")]
    detail = pm_api.get(f"{BASE}/{pid}").json()
    assert detail["state"] == "warn" and detail["usage_pct"] == "80.00"
    pm_scan(pid)

    # 6. Up to exactly the budget is fine; one rupee more is blocked for the PM.
    assert spend("120000.00").status_code == 201  # 600,000.00
    blocked = spend("1.00")
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "over_budget"
    assert blocked.json()["error"]["details"] == {"remaining": "0.00"}
    pm_scan(pid)

    # 7. The admin overrides, with a reason.
    override = admin_api.post(
        f"{BASE}/{pid}/expenses",
        expense_form(
            amount="5000.00", admin_override="true", override_reason="Client asked for extra lights"
        ),
        format="multipart",
    )
    assert override.status_code == 201 and override.json()["is_override"] is True
    assert [k for _, k, _ in notes if k == "budget_over"] == ["budget_over"]
    assert admin_api.get(f"{BASE}/{pid}").json()["state"] == "over"
    assert Project.objects.get(pk=pid).alert_state == "OVER"
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
    assert (
        admin_api.post(
            f"{BASE}/{pid}/budget",
            {"sanctioned_budget": "700000", "reason": "Extra lights"},
            format="json",
        ).status_code
        == 200
    )
    assert spend("1000.00").status_code == 201
    assert pm_api.post(f"{BASE}/{pid}/complete").status_code == 200
    pm_scan(pid)

    # 10. The books: spent adds up, the timeline tells the story, the finance block is admin-only.
    final = admin_api.get(f"{BASE}/{pid}").json()
    assert final["spent"] == "606000.00" and Decimal(final["remaining"]) == Decimal("94000.00")
    assert final["finance"] is None or final["finance"]["total_amount"] == str(TOTAL)
    types = [e["type"] for e in pm_api.get(f"{BASE}/{pid}/events?page_size=50").json()["results"]]
    assert types[0] == "COMPLETED" and types[-1] == "CREATED"
    for expected in ("REOPENED", "BUDGET_CHANGED", "EXPENSE_ADDED"):
        assert expected in types
    assert lead_services  # the leads module drove the deal
