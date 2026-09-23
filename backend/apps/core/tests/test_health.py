from rest_framework.test import APIClient


def test_health_is_public():
    res = APIClient().get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
