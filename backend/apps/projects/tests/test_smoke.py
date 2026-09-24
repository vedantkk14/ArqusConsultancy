from .conftest import BASE, EXPENSES, expense_form


def test_convert_add_expense_and_lists(client_for, admin, pm1, project):
    pm_client = client_for(pm1)
    res = pm_client.post(f"{BASE}/{project.pk}/expenses", expense_form(), format="multipart")
    assert res.status_code == 201, res.content
    assert res.json()["amount"] == "1000.00"

    listing = pm_client.get(f"{BASE}?status=running").json()
    assert listing["count"] == 1
    assert listing["results"][0]["spent"] == "1000.00"
    assert listing["results"][0]["state"] == "ok"

    detail = client_for(admin).get(f"{BASE}/{project.pk}").json()
    assert detail["spent"] == "1000.00"
    assert client_for(admin).get(f"{BASE}/summary").json()["running"] == 1
    assert client_for(admin).get(f"{EXPENSES}/summary").json()["total"] == "1000.00"
    assert client_for(admin).get(f"{EXPENSES}/alerts").json()["count"] == 0
    assert client_for(admin).get(f"{BASE}/convertible").status_code == 200
    assert client_for(admin).get(f"{BASE}/managers").json()[0]["running_projects"] == 1
    assert client_for(admin).get(f"{EXPENSES}/export").status_code == 200
