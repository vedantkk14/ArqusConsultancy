import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def pm_user():
    return User.objects.create_user(
        username="pm1",
        password="pw-12345-x",
        first_name="Pat",
        last_name="Manager",
        email="pm1@example.com",
        role=User.Role.PROJECT_MANAGER,
    )


def test_login_returns_tokens_and_user(client, pm_user):
    res = client.post("/api/v1/auth/login", {"username": "pm1", "password": "pw-12345-x"})
    assert res.status_code == 200
    assert res.data["access"] and res.data["refresh"]
    assert res.data["user"] == {
        "id": pm_user.id,
        "name": "Pat Manager",
        "email": "pm1@example.com",
        "role": "PROJECT_MANAGER",
    }


def test_login_bad_password_uses_error_format(client, pm_user):
    res = client.post("/api/v1/auth/login", {"username": "pm1", "password": "wrong"})
    assert res.status_code == 401
    assert set(res.data["error"]) == {"code", "message", "details"}


def test_refresh_returns_new_access_token(client, pm_user):
    login = client.post("/api/v1/auth/login", {"username": "pm1", "password": "pw-12345-x"})
    res = client.post("/api/v1/auth/refresh", {"refresh": login.data["refresh"]})
    assert res.status_code == 200
    assert res.data["access"]


def test_me_returns_role(client, pm_user):
    login = client.post("/api/v1/auth/login", {"username": "pm1", "password": "pw-12345-x"})
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    res = client.get("/api/v1/me")
    assert res.status_code == 200
    assert res.data["role"] == "PROJECT_MANAGER"


def test_me_requires_authentication(client):
    res = client.get("/api/v1/me")
    assert res.status_code == 401
    assert res.data["error"]["code"] == "not_authenticated"
