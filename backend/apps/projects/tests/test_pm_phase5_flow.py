"""Phase 5 end to end, through the API: Admin assigns -> PM tracks budget/expenses -> completion."""

from decimal import Decimal

from .conftest import BASE, assert_no_leak, expense_form

DASH = "/api/v1/dashboard/pm"


def code(res):
    return res.json()["error"]["code"]


def test_phase5_workflow(client_for, admin, pm1, make_lead, notes):
    lead = make_lead()
    a, p = client_for(admin), client_for(pm1)

    # 1. Admin converts the won lead, sanctions 60,000 and assigns the PM.
    created = a.post(
        BASE,
        {"lead": lead.pk, "name": "Riverside Court", "sanctioned_budget": "60000", "pm": pm1.pk},
        format="json",
    )
    assert created.status_code == 201, created.content
    pid = created.json()["id"]
    assert (pm1.pk, "project_assigned") in [(u, k) for u, k, _ in notes]

    # 2. PM opens it: budget only, no total / lead anywhere.
    detail = p.get(f"{BASE}/{pid}")
    assert detail.json()["sanctioned_budget"] == "60000.00"
    assert_no_leak(detail)

    # 3. First expense: remaining is aggregated, exactly 55,000.
    first = p.post(f"{BASE}/{pid}/expenses", expense_form(amount="5000"), format="multipart")
    assert first.status_code == 201
    assert p.get(f"{BASE}/{pid}").json()["remaining"] == "55000.00"
    assert p.get(DASH).json()["alerts"] == []

    # 4. Crossing 80% raises an alert on the PM's own dashboard and a budget_warn for the admin.
    second = p.post(f"{BASE}/{pid}/expenses", expense_form(amount="44000"), format="multipart")
    assert second.status_code == 201
    dash = p.get(DASH).json()
    assert [(x["project_id"], x["state"]) for x in dash["alerts"]] == [(pid, "warn")]
    assert (admin.pk, "budget_warn") in [(u, k) for u, k, _ in notes]

    # 5. A third expense over 100% is blocked; only an admin override with a reason posts it.
    blocked = p.post(f"{BASE}/{pid}/expenses", expense_form(amount="20000"), format="multipart")
    assert blocked.status_code == 409 and code(blocked) == "over_budget"
    assert_no_leak(blocked)
    pm_try = p.post(
        f"{BASE}/{pid}/expenses",
        expense_form(amount="20000", admin_override="true", override_reason="please"),
        format="multipart",
    )
    assert pm_try.status_code == 409
    no_reason = a.post(
        f"{BASE}/{pid}/expenses",
        expense_form(amount="20000", admin_override="true"),
        format="multipart",
    )
    assert no_reason.status_code == 400
    override = a.post(
        f"{BASE}/{pid}/expenses",
        expense_form(amount="20000", admin_override="true", override_reason="Client extra scope"),
        format="multipart",
    )
    assert override.status_code == 201
    assert (admin.pk, "budget_over") in [(u, k) for u, k, _ in notes]

    # 6. Dashboard and project detail agree, number for number.
    dash = p.get(DASH).json()
    detail = p.get(f"{BASE}/{pid}").json()
    row = dash["projects"][0]
    assert dash["kpis"]["total_spent"] == detail["spent"] == "69000.00"
    assert dash["kpis"]["total_remaining"] == detail["remaining"] == "-9000.00"
    assert (row["usage_pct"], row["state"]) == (detail["usage_pct"], detail["state"])
    assert dash["alerts"][0]["state"] == "over"
    assert sum(Decimal(x["amount"]) for x in dash["recent_expenses"]) == Decimal("69000.00")

    # 7. The PM completes it. `complete` notifies every admin plus the PM, except the actor.
    before = dash["kpis"]["projects_completed"]
    notes.clear()
    done = p.post(f"{BASE}/{pid}/complete")
    assert done.status_code == 200
    assert [(u, k) for u, k, _ in notes] == [(admin.pk, "project_completed")]
    locked = p.post(f"{BASE}/{pid}/expenses", expense_form(), format="multipart")
    assert locked.status_code == 409 and code(locked) == "project_completed"
    after = p.get(DASH).json()
    assert after["kpis"]["projects_completed"] == before + 1
    assert after["alerts"] == []  # completed projects no longer nag

    # 8. Activity shows the completion, newest first.
    first_event = after["recent_activity"][0]
    assert first_event["type"] == "project_completed"
    assert first_event["text"] == "Project marked Completed"
    assert_no_leak(p.get(DASH))
