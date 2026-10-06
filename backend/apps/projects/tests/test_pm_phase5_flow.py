"""Phase 5 end to end, through the API: Admin assigns -> PM logs expenses -> completion.

The PM never sees a budget; the admin sees expenses against the deal total.
"""

from decimal import Decimal

from .conftest import BASE, assert_no_leak, expense_form

DASH = "/api/v1/dashboard/pm"


def code(res):
    return res.json()["error"]["code"]


def test_phase5_workflow(client_for, admin, pm1, make_opportunity, notes):
    lead = make_opportunity(proposed_amount=Decimal("60000"))  # the deal total is 60,000
    a, p = client_for(admin), client_for(pm1)

    # 1. Admin converts the won lead and assigns the PM.
    created = a.post(
        BASE, {"opportunity": lead.pk, "name": "Riverside Court", "pm": pm1.pk}, format="json"
    )
    assert created.status_code == 201, created.content
    pid = created.json()["id"]
    assert (pm1.pk, "project_assigned") in [(u, k) for u, k, _ in notes]

    # 2. PM opens it: no budget, no total, no lead anywhere.
    detail = p.get(f"{BASE}/{pid}")
    assert detail.json()["spent"] == "0.00" and "total_budget" not in detail.json()
    assert_no_leak(detail)

    # 3. Expenses: the admin's remaining is the deal total minus expenses so far.
    first = p.post(f"{BASE}/{pid}/expenses", expense_form(amount="5000"), format="multipart")
    assert first.status_code == 201
    assert a.get(f"{BASE}/{pid}").json()["remaining"] == "55000.00"

    # 4. Going past the deal total is never blocked, for the PM or the admin.
    for client in (p, a):
        res = client.post(
            f"{BASE}/{pid}/expenses", expense_form(amount="32000"), format="multipart"
        )
        assert res.status_code == 201
        assert_no_leak(p.get(f"{BASE}/{pid}"))
    admin_view = a.get(f"{BASE}/{pid}").json()
    assert admin_view["remaining"] == "-9000.00" and admin_view["state"] == "over"
    assert [k for _, k, _ in notes if k.startswith("budget_")] == []

    # 5. Dashboard and project detail agree on the PM's own expenses (the admin's 32,000 is hidden).
    dash = p.get(DASH).json()
    assert dash["kpis"]["total_spent"] == p.get(f"{BASE}/{pid}").json()["spent"] == "37000.00"
    assert sum(Decimal(x["amount"]) for x in dash["recent_expenses"]) == Decimal("37000.00")

    # 6. The PM completes it. `complete` notifies every admin plus the PM, except the actor.
    before = dash["kpis"]["projects_completed"]
    notes.clear()
    done = p.post(f"{BASE}/{pid}/complete")
    assert done.status_code == 200
    assert [(u, k) for u, k, _ in notes] == [(admin.pk, "project_completed")]
    locked = p.post(f"{BASE}/{pid}/expenses", expense_form(), format="multipart")
    assert locked.status_code == 409 and code(locked) == "project_completed"
    after = p.get(DASH).json()
    assert after["kpis"]["projects_completed"] == before + 1

    # 7. Activity shows the completion, newest first.
    first_event = after["recent_activity"][0]
    assert first_event["type"] == "project_completed"
    assert first_event["text"] == "Project marked Completed"
    assert_no_leak(p.get(DASH))
