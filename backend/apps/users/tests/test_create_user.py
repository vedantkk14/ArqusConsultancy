"""Admin creates accounts: every role can then sign in and is told who they are."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .conftest import *  # noqa: F401,F403  (autouse cache + fast hasher fixtures)

User = get_user_model()
URL = "/api/v1/users"
ROLES = ["ADMIN", "SALES_MANAGER", "SALES_EXEC", "PROJECT_MANAGER"]


def body(**over):
    data = {
        "username": "riya.k",
        "email": "riya@crm.local",
        "first_name": "Riya",
        "last_name": "Kapoor",
        "phone": "9876543210",
        "role": "SALES_EXEC",
        "password": "Welcome#2026x",
    }
    data.update(over)
    return data


@pytest.fixture
def admin(db):
    return User.objects.create_user("boss", "boss@crm.local", "pw", role="ADMIN")


def as_user(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
@pytest.mark.parametrize("role", ROLES)
def test_admin_creates_every_role_and_they_can_sign_in(admin, role):
    res = as_user(admin).post(
        URL,
        body(role=role, username=f"u_{role.lower()}", email=f"{role.lower()}@crm.local"),
        format="json",
    )
    assert res.status_code == 201, res.json()
    data = res.json()
    assert data["role"] == role and data["must_change_password"] is True
    assert "password" not in data

    # By username and by email, any case; the response tells the app who they are.
    for who in (f"u_{role.lower()}", f"{role.upper()}@crm.local"):
        login = APIClient().post(
            "/api/v1/auth/login", {"identifier": who, "password": "Welcome#2026x"}, format="json"
        )
        assert login.status_code == 200, login.json()
        assert login.json()["user"]["role"] == role
        assert login.json()["must_change_password"] is True
    assert User.objects.get(username=f"u_{role.lower()}").is_staff is (role == "ADMIN")


@pytest.mark.django_db
def test_can_skip_the_forced_password_change(admin):
    res = as_user(admin).post(URL, body(must_change_password=False), format="json")
    assert res.status_code == 201 and res.json()["must_change_password"] is False


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["SALES_MANAGER", "SALES_EXEC", "PROJECT_MANAGER"])
def test_only_admins_can_create_accounts(role):
    user = User.objects.create_user("x", "x@crm.local", "pw", role=role)
    assert as_user(user).post(URL, body(), format="json").status_code == 403
    assert not User.objects.filter(username="riya.k").exists()


@pytest.mark.django_db
def test_anonymous_gets_401():
    assert APIClient().post(URL, body(), format="json").status_code == 401


@pytest.mark.django_db
def test_duplicates_and_bad_input_are_field_errors(admin):
    client = as_user(admin)
    assert client.post(URL, body(), format="json").status_code == 201
    res = client.post(URL, body(username="RIYA.K", email="RIYA@crm.local"), format="json")
    assert res.status_code == 400
    details = res.json()["error"]["details"]
    assert "username" in details and "email" in details

    res = client.post(
        URL, body(username="a b", email="nope", role="OWNER", first_name=""), format="json"
    )
    assert {"username", "email", "role", "first_name"} <= set(res.json()["error"]["details"])


@pytest.mark.django_db
@pytest.mark.parametrize("weak", ["short1", "password123", "12345678", "riya.kapoor"])
def test_weak_passwords_are_rejected(admin, weak):
    res = as_user(admin).post(URL, body(password=weak), format="json")
    assert res.status_code == 400 and "password" in res.json()["error"]["details"]
    assert not User.objects.filter(username="riya.k").exists()
