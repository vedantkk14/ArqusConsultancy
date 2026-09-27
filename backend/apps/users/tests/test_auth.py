import logging
import re

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from rest_framework.test import APIClient

from apps.users.services import set_temporary_password

User = get_user_model()
pytestmark = pytest.mark.django_db

PASSWORD = "Correct-Horse-42"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/me"
CHANGE = "/api/v1/auth/password/change"
FORGOT = "/api/v1/auth/password/forgot"
RESET = "/api/v1/auth/password/reset"

ROLES = ["ADMIN", "SALES_MANAGER", "SALES_EXEC", "PROJECT_MANAGER"]


@pytest.fixture
def client():
    return APIClient()


def make_user(username="pm1", role="PROJECT_MANAGER", email=None, **extra):
    return User.objects.create_user(
        username=username,
        password=PASSWORD,
        email=email or f"{username}@example.com",
        first_name="Pat",
        last_name="Manager",
        role=role,
        **extra,
    )


def login(client, identifier, password=PASSWORD, ip="10.0.0.1"):
    return client.post(LOGIN, {"identifier": identifier, "password": password}, REMOTE_ADDR=ip)


def assert_error(res, status, code):
    assert res.status_code == status, res.content
    body = res.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == code
    return body["error"]


# ---- Login ---------------------------------------------------------------------------------------


@pytest.mark.parametrize("role", ROLES)
def test_login_every_role_with_username_or_email_any_case(client, role):
    user = make_user(
        username=f"user_{role.lower()}", role=role, email=f"{role.lower()}@Example.com"
    )
    for identifier in (user.username, user.username.upper(), user.email, user.email.upper()):
        res = login(client, identifier)
        assert res.status_code == 200, identifier
        body = res.json()
        assert body["access"] and body["refresh"]
        assert body["must_change_password"] is False
        assert body["user"] == {
            "id": user.id,
            "name": "Pat Manager",
            "email": user.email,
            "role": role,
            "must_change_password": False,
        }


def test_login_still_accepts_the_old_username_field(client):
    make_user()
    res = client.post(LOGIN, {"username": "pm1", "password": PASSWORD})
    assert res.status_code == 200


def test_missing_identifier_is_a_field_error(client):
    err = assert_error(client.post(LOGIN, {"password": "x"}), 400, "validation_error")
    assert "identifier" in err["details"]


def test_wrong_password_and_unknown_user_look_identical(client):
    make_user()
    wrong = login(client, "pm1", "nope")
    unknown = login(client, "nobody@example.com", "nope")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["error"]["message"] == "Incorrect email or password."
    assert_error(wrong, 401, "invalid_credentials")


def test_inactive_user_is_only_revealed_with_the_right_password(client):
    make_user(is_active=False)
    err = assert_error(login(client, "pm1"), 403, "account_disabled")
    assert err["message"] == "This account is disabled. Contact your administrator."
    assert_error(login(client, "pm1", "wrong"), 401, "invalid_credentials")


def test_ambiguous_email_is_treated_as_unknown(client):
    make_user(username="a1", email="shared@example.com")
    make_user(username="a2", email="shared@example.com")
    assert_error(login(client, "shared@example.com"), 401, "invalid_credentials")
    assert login(client, "a1").status_code == 200


# ---- Lockout and throttling ----------------------------------------------------------------------


def test_lockout_after_five_failures_even_for_the_right_password(client):
    make_user()
    for _ in range(4):
        assert_error(login(client, "pm1", "bad"), 401, "invalid_credentials")
    err = assert_error(login(client, "pm1", "bad"), 429, "account_locked")
    assert 890 <= err["details"]["retry_after"] <= 900
    assert isinstance(err["details"]["retry_after"], int)
    assert_error(login(client, "pm1"), 429, "account_locked")  # correct password, still locked


def test_success_clears_the_failure_counter(client):
    make_user()
    for _ in range(4):
        login(client, "pm1", "bad")
    assert login(client, "pm1").status_code == 200
    for _ in range(4):
        assert_error(login(client, "pm1", "bad"), 401, "invalid_credentials")


def test_lockout_is_per_identifier_and_ip(client):
    make_user(username="pm1")
    make_user(username="pm2")
    for _ in range(5):
        login(client, "pm1", "bad")
    assert_error(login(client, "pm1"), 429, "account_locked")
    assert login(client, "pm2").status_code == 200  # other identifier, same IP
    assert login(client, "pm1", ip="10.9.9.9").status_code == 200  # same identifier, other IP
    assert_error(login(client, "PM1"), 429, "account_locked")  # identifier is case-insensitive


def test_login_is_throttled_per_ip(client):
    for i in range(20):
        login(client, f"nobody{i}", "x")
    err = assert_error(login(client, "nobody-final", "x"), 429, "too_many_requests")
    assert isinstance(err["details"]["retry_after"], int)


def test_forgot_is_throttled_per_ip(client):
    for _ in range(5):
        assert client.post(FORGOT, {"email": "x@example.com"}).status_code == 200
    assert_error(client.post(FORGOT, {"email": "x@example.com"}), 429, "too_many_requests")


# ---- Tokens --------------------------------------------------------------------------------------


def test_refresh_rotates_and_the_old_refresh_is_rejected(client):
    make_user()
    first = login(client, "pm1").json()["refresh"]
    res = client.post(REFRESH, {"refresh": first})
    assert res.status_code == 200
    assert res.json()["access"] and res.json()["refresh"] != first
    assert_error(client.post(REFRESH, {"refresh": first}), 401, "token_invalid")


def test_refresh_with_garbage_is_token_invalid(client):
    assert_error(client.post(REFRESH, {"refresh": "not-a-token"}), 401, "token_invalid")


def test_logout_blacklists_and_always_returns_204(client):
    make_user()
    refresh = login(client, "pm1").json()["refresh"]
    assert client.post(LOGOUT, {"refresh": refresh}).status_code == 204
    assert_error(client.post(REFRESH, {"refresh": refresh}), 401, "token_invalid")
    assert client.post(LOGOUT, {"refresh": refresh}).status_code == 204  # already revoked
    assert client.post(LOGOUT, {"refresh": "garbage"}).status_code == 204
    assert client.post(LOGOUT, {}).status_code == 204
    client.credentials(HTTP_AUTHORIZATION="Bearer expired-or-garbage")
    assert client.post(LOGOUT, {"refresh": "x"}).status_code == 204  # no valid access token needed


def test_me_includes_must_change_password(client):
    user = make_user()
    set_temporary_password(user, "Temp-Pass-99")
    body = login(client, "pm1", "Temp-Pass-99").json()
    assert body["must_change_password"] is True
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    assert client.get(ME).json()["must_change_password"] is True


# ---- Password change -----------------------------------------------------------------------------


def _signed_in(client, username="pm1", password=PASSWORD):
    body = login(client, username, password).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    return body


def test_change_rejects_a_wrong_current_password(client):
    make_user()
    _signed_in(client)
    err = assert_error(
        client.post(CHANGE, {"old_password": "nope", "new_password": "Brand-New-Pass-7"}),
        400,
        "validation_error",
    )
    assert "old_password" in err["details"]


@pytest.mark.parametrize("simple", ["1", "1234", "password", "pm1"])
def test_change_accepts_any_password(client, simple):
    make_user()
    _signed_in(client)
    res = client.post(CHANGE, {"old_password": PASSWORD, "new_password": simple})
    assert res.status_code == 200
    assert login(client, "pm1", simple).status_code == 200


def test_change_success_revokes_old_sessions_and_returns_working_tokens(client):
    user = make_user()
    set_temporary_password(user, "Temp-Pass-99")
    other_device = login(client, "pm1", "Temp-Pass-99").json()["refresh"]
    this_device = _signed_in(client, password="Temp-Pass-99")

    res = client.post(CHANGE, {"old_password": "Temp-Pass-99", "new_password": "Brand-New-Pass-7"})
    assert res.status_code == 200
    body = res.json()
    assert body["must_change_password"] is False and body["user"]["must_change_password"] is False

    for old in (other_device, this_device["refresh"]):
        assert_error(client.post(REFRESH, {"refresh": old}), 401, "token_invalid")
    assert client.post(REFRESH, {"refresh": body["refresh"]}).status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    assert client.get(ME).json()["must_change_password"] is False
    user.refresh_from_db()
    assert user.check_password("Brand-New-Pass-7")


def test_change_requires_authentication(client):
    assert_error(
        client.post(CHANGE, {"old_password": "a", "new_password": "b"}), 401, "not_authenticated"
    )


# ---- Forgot and reset ----------------------------------------------------------------------------


def _link_parts(message) -> tuple[str, str]:
    match = re.search(r"/reset-password/([^/\s]+)/([^/\s]+)", message.body)
    assert match, message.body
    return match.group(1), match.group(2)


def test_forgot_is_identical_for_known_and_unknown_emails(client):
    make_user(email="pat@example.com")
    known = client.post(FORGOT, {"email": "PAT@example.com"})
    unknown = client.post(FORGOT, {"email": "ghost@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert (
        known.json()
        == unknown.json()
        == {"message": "If that email is registered, we've sent a reset link."}
    )
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == ["pat@example.com"]
    assert "http://localhost:4200/reset-password/" in message.body
    assert message.alternatives and "text/html" in message.alternatives[0][1]


def test_forgot_sends_nothing_for_inactive_accounts(client):
    make_user(email="pat@example.com", is_active=False)
    assert client.post(FORGOT, {"email": "pat@example.com"}).status_code == 200
    assert mail.outbox == []


def test_forgot_hides_email_failures(client, monkeypatch):
    make_user(email="pat@example.com")

    def boom(*args, **kwargs):
        raise OSError("smtp down")

    monkeypatch.setattr("apps.users.services.send_mail", boom)
    assert client.post(FORGOT, {"email": "pat@example.com"}).status_code == 200


def test_reset_works_exactly_once_and_clears_the_flag(client):
    user = make_user(email="pat@example.com")
    set_temporary_password(user, "Temp-Pass-99")
    old_refresh = login(client, "pm1", "Temp-Pass-99").json()["refresh"]
    client.post(FORGOT, {"email": "pat@example.com"})
    uid, token = _link_parts(mail.outbox[0])

    res = client.post(RESET, {"uid": uid, "token": token, "new_password": "Reset-Pass-2024x"})
    assert res.status_code == 200
    user.refresh_from_db()
    assert user.check_password("Reset-Pass-2024x") and user.must_change_password is False
    assert_error(client.post(REFRESH, {"refresh": old_refresh}), 401, "token_invalid")

    again = client.post(RESET, {"uid": uid, "token": token, "new_password": "Another-Pass-2024y"})
    assert_error(again, 400, "reset_link_invalid")


def test_reset_rejects_tampered_links_but_not_simple_passwords(client):
    make_user(email="pat@example.com")
    client.post(FORGOT, {"email": "pat@example.com"})
    uid, token = _link_parts(mail.outbox[0])
    assert_error(
        client.post(
            RESET, {"uid": uid, "token": token[:-2] + "zz", "new_password": "Reset-Pass-2024x"}
        ),
        400,
        "reset_link_invalid",
    )
    assert_error(
        client.post(RESET, {"uid": "bogus", "token": token, "new_password": "Reset-Pass-2024x"}),
        400,
        "reset_link_invalid",
    )
    ok = client.post(RESET, {"uid": uid, "token": token, "new_password": "1234"})
    assert ok.status_code == 200  # no strength rules: a short numeric password is fine


# ---- Logs ----------------------------------------------------------------------------------------


def test_no_passwords_or_tokens_in_logs(client, caplog, monkeypatch):
    caplog.set_level(logging.DEBUG)
    make_user(email="pat@example.com")
    body = login(client, "pm1").json()
    login(client, "pm1", "Wrong-Secret-123")
    client.post(REFRESH, {"refresh": body["refresh"]})
    client.post(LOGOUT, {"refresh": body["refresh"]})
    client.post(FORGOT, {"email": "pat@example.com"})
    uid, token = _link_parts(mail.outbox[0])

    def boom(*args, **kwargs):
        raise OSError("smtp down")

    monkeypatch.setattr("apps.users.services.send_mail", boom)
    client.post(FORGOT, {"email": "pat@example.com"})  # the failure is logged

    logged = caplog.text
    for secret in (PASSWORD, "Wrong-Secret-123", body["access"], body["refresh"], token):
        assert secret not in logged
    assert "Could not send the password reset email" in logged
