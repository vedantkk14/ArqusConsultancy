"""Authentication business logic: login with lockout, token issue/revoke, password change and reset.

Never log passwords, tokens or reset links.
"""

from __future__ import annotations

import hashlib
import logging
import math
import time

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.models import update_last_login
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.html import escape
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from .exceptions import (
    AccountDisabled,
    AccountLocked,
    CannotChangeOwnRole,
    CannotSelfDeactivate,
    InvalidCredentials,
    LastAdmin,
    NotASalesExec,
    ResetLinkInvalid,
)

logger = logging.getLogger(__name__)
User = get_user_model()

FORGOT_PASSWORD_MESSAGE = "If that email is registered, we've sent a reset link."


# ---- Lockout -------------------------------------------------------------------------------------
# Keyed by (lowercased identifier + client IP), hashed so the cache never holds raw identifiers.


def _lock_keys(identifier: str, ip: str) -> tuple[str, str]:
    digest = hashlib.sha256(f"{identifier.strip().lower()}|{ip}".encode()).hexdigest()
    return f"auth:fail:{digest}", f"auth:lock:{digest}"


def _lockout_seconds() -> int:
    return settings.LOGIN_LOCKOUT_MINUTES * 60


def locked_for(identifier: str, ip: str) -> int:
    """Seconds left on a lockout for this identifier + IP, or 0."""
    _, lock_key = _lock_keys(identifier, ip)
    until = cache.get(lock_key)
    remaining = math.ceil(until - time.time()) if until else 0
    return max(remaining, 0)


def register_failure(identifier: str, ip: str) -> None:
    fail_key, lock_key = _lock_keys(identifier, ip)
    count = (cache.get(fail_key) or 0) + 1
    if count >= settings.LOGIN_MAX_ATTEMPTS:
        cache.set(lock_key, time.time() + _lockout_seconds(), _lockout_seconds())
        cache.delete(fail_key)
    else:
        cache.set(fail_key, count, _lockout_seconds())


def clear_failures(identifier: str, ip: str) -> None:
    cache.delete_many(list(_lock_keys(identifier, ip)))


# ---- Login ---------------------------------------------------------------------------------------


def find_user(identifier: str):
    """Username (exact, case-insensitive) first, then a unique email match. None if ambiguous."""
    identifier = identifier.strip()
    if not identifier:
        return None
    user = User.objects.filter(username__iexact=identifier).first()
    if user:
        return user
    matches = list(User.objects.filter(email__iexact=identifier)[:2])
    return matches[0] if len(matches) == 1 else None


def authenticate_login(identifier: str, password: str, ip: str):
    """Return the user for valid credentials, or raise the matching auth error.

    Order matters: lockout first (even a correct password is refused while locked), then the
    password, then the active flag, so a disabled account is only revealed to someone who knows
    its password.
    """
    remaining = locked_for(identifier, ip)
    if remaining:
        raise AccountLocked(retry_after=remaining)

    user = find_user(identifier)
    if user is None:
        User().set_password(password)  # same hashing cost as a real check: similar response time
        password_ok = False
    else:
        password_ok = user.check_password(password)

    if not password_ok:
        register_failure(identifier, ip)
        remaining = locked_for(identifier, ip)
        if remaining:
            raise AccountLocked(retry_after=remaining)
        raise InvalidCredentials()

    clear_failures(identifier, ip)
    if not user.is_active:
        raise AccountDisabled()
    return user


def issue_tokens(user) -> dict:
    refresh = RefreshToken.for_user(user)
    if settings.SIMPLE_JWT.get("UPDATE_LAST_LOGIN"):
        update_last_login(None, user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def blacklist_refresh(raw_token: str) -> None:
    """Blacklist one refresh token. Invalid or already-blacklisted tokens are ignored."""
    try:
        RefreshToken(raw_token).blacklist()
    except Exception:  # noqa: BLE001 - logout must never fail
        logger.info("logout with an invalid or already revoked refresh token")


def blacklist_all_tokens(user) -> None:
    """Revoke every outstanding refresh token of `user` (all devices)."""
    outstanding = OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in outstanding], ignore_conflicts=True
    )


# ---- Passwords -----------------------------------------------------------------------------------


@transaction.atomic
def change_password(user, new_password: str) -> dict:
    """Set a new password (already validated), revoke other sessions, return fresh tokens."""
    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])
    blacklist_all_tokens(user)
    return issue_tokens(user)


@transaction.atomic
def set_temporary_password(user, raw_password: str) -> None:
    """For the Team module: an admin creates a user or resets their password.

    The user must choose their own password at next sign-in; existing sessions are revoked.
    """
    user.set_password(raw_password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    blacklist_all_tokens(user)


@transaction.atomic
def create_user(data: dict):
    """Admin creates an account with a temporary password, checked against the user's own details.

    With `must_change_password` (the default) the person picks their own password at first sign-in.
    """
    password = data["password"]
    candidate = User(
        username=data["username"],
        email=data["email"],
        first_name=data["first_name"],
        last_name=data["last_name"],
    )
    validate_new_password(password, candidate, field="password")
    user = User.objects.create_user(
        username=data["username"],
        email=data["email"],
        password=password,
        first_name=data["first_name"],
        last_name=data["last_name"],
        phone=data.get("phone", ""),
        role=data["role"],
        must_change_password=data.get("must_change_password", True),
        **({"commission_rate": data["commission_rate"]} if "commission_rate" in data else {}),
    )
    if user.role == User.Role.ADMIN:
        user.is_staff = True  # lets an admin use /admin/, like the seeded admin
        user.save(update_fields=["is_staff"])
    return user


def reset_link(user) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"


def send_password_reset(email: str) -> None:
    """Email a reset link to every active account with this address. Silent when there is none.

    Failures are logged (without the link) and never reach the client.
    """
    minutes = max(settings.PASSWORD_RESET_TIMEOUT // 60, 1)
    for user in User.objects.filter(email__iexact=email.strip(), is_active=True):
        link = reset_link(user)
        name = user.display_name
        text = (
            f"Hi {name},\n\n"
            "Someone asked to reset the password for your ARQUS CRM account.\n"
            f"Set a new password here (the link works once and expires in {minutes} minutes):\n\n"
            f"{link}\n\n"
            "If you didn't ask for this, you can ignore this email; your password won't change.\n"
        )
        html = (
            f"<p>Hi {escape(name)},</p>"
            "<p>Someone asked to reset the password for your ARQUS CRM account.</p>"
            f'<p><a href="{escape(link)}">Set a new password</a></p>'
            f"<p>The link works once and expires in {minutes} minutes. If you didn't ask for this, "
            "you can ignore this email; your password won't change.</p>"
        )
        try:
            send_mail(
                "Reset your ARQUS CRM password",
                text,
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                html_message=html,
            )
        except Exception:  # noqa: BLE001 - never leak delivery problems to the client
            logger.exception("Could not send the password reset email (user id %s)", user.pk)


def user_from_reset_link(uid: str, token: str):
    """The user a valid reset link belongs to, or raise ResetLinkInvalid.

    Links are single-use: the token hashes the current password, so it dies once the password
    changes.
    """
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        raise ResetLinkInvalid() from None
    if not user.is_active or not default_token_generator.check_token(user, token):
        raise ResetLinkInvalid()
    return user


@transaction.atomic
def reset_password(user, new_password: str) -> None:
    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])
    blacklist_all_tokens(user)


def validate_new_password(password: str, user=None, field: str = "new_password") -> None:
    """Run Django's validators; errors come back under `field` in `details`."""
    from rest_framework.exceptions import ValidationError

    try:
        password_validation.validate_password(password, user)
    except Exception as exc:  # django.core.exceptions.ValidationError
        raise ValidationError({field: list(getattr(exc, "messages", [str(exc)]))}) from None


# ---- Team: admin actions on other accounts ----------------------------------------------

_TEMP_LOWER = "abcdefghijkmnopqrstuvwxyz"
_TEMP_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_TEMP_DIGITS = "23456789"
_TEMP_SYMBOLS = "#@$%&*!?"


def generate_temporary_password(length: int = 14) -> str:
    """Random, easy to read out loud (no look-alike characters), one of each kind at least."""
    import secrets

    pick = secrets.choice
    every = _TEMP_LOWER + _TEMP_UPPER + _TEMP_DIGITS + _TEMP_SYMBOLS
    chars = [pick(_TEMP_LOWER), pick(_TEMP_UPPER), pick(_TEMP_DIGITS), pick(_TEMP_SYMBOLS)]
    chars += [pick(every) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def active_admin_count() -> int:
    return User.objects.filter(role=User.Role.ADMIN, is_active=True).count()


@transaction.atomic
def update_user(user, data: dict, by):
    """Name, email, phone and role. An admin can't change their own role (no self-lockout)."""
    if "role" in data and data["role"] != user.role:
        if user.pk == by.pk:
            raise CannotChangeOwnRole()
        if user.role == User.Role.ADMIN and active_admin_count() <= 1 and user.is_active:
            raise LastAdmin()
    if (
        "email" in data
        and User.objects.filter(email__iexact=data["email"]).exclude(pk=user.pk).exists()
    ):
        from rest_framework.exceptions import ValidationError

        raise ValidationError({"email": ["An account with this email already exists."]})
    for field, value in data.items():
        setattr(user, field, value)
    user.save()
    return user


@transaction.atomic
def deactivate_user(user, by):
    if user.pk == by.pk:
        raise CannotSelfDeactivate()
    if user.is_active and user.role == User.Role.ADMIN and active_admin_count() <= 1:
        raise LastAdmin()
    user.is_active = False
    user.save(update_fields=["is_active"])
    blacklist_all_tokens(user)  # signed out everywhere, now
    return user


@transaction.atomic
def reactivate_user(user):
    user.is_active = True
    user.save(update_fields=["is_active"])
    return user


def admin_reset_password(user) -> str:
    """New temporary password for `user`, returned once (never emailed here).

    TODO(SMTP): send it (or a reset link) by email once an email backend is configured.
    """
    password = generate_temporary_password()
    for _ in range(5):
        try:
            password_validation.validate_password(password, user)
            break
        except Exception:  # noqa: BLE001 - too similar to the user's details: draw another
            password = generate_temporary_password()
    set_temporary_password(user, password)
    return password


def set_commission_rate(user, rate):
    if user.role != User.Role.SALES_EXEC:
        raise NotASalesExec()
    user.commission_rate = rate
    user.save(update_fields=["commission_rate"])
    return user


def _model(app_label: str, name: str):
    from django.apps import apps

    try:
        return apps.get_model(app_label, name)
    except LookupError:
        return None


def assignments_overview() -> dict:
    """Open and overdue leads per exec, running and over-budget projects per PM.

    Other apps' models are read through apps.get_model, so this works whatever is merged: a missing
    model gives zeros and `data_sources[...] = False`.
    """
    from django.core.exceptions import FieldError
    from django.db.models import Count, F, Q
    from django.utils import timezone

    execs = list(
        User.objects.filter(role=User.Role.SALES_EXEC, is_active=True).order_by(
            "first_name", "username"
        )
    )
    pms = list(
        User.objects.filter(role=User.Role.PROJECT_MANAGER, is_active=True).order_by(
            "first_name", "username"
        )
    )

    lead_counts: dict = {}
    leads_ok = False
    lead_model = _model("leads", "Lead")
    if lead_model is not None:
        try:
            rows = (
                lead_model.objects.exclude(status__in=("WON", "LOST"))
                .filter(assigned_to__in=[u.pk for u in execs])
                .values("assigned_to")
                .annotate(
                    open=Count("id"),
                    overdue=Count("id", filter=Q(next_followup_at__lt=timezone.now())),
                )
            )
            lead_counts = {r["assigned_to"]: r for r in rows}
            leads_ok = True
        except FieldError:  # pragma: no cover - the leads model changed shape
            pass

    project_counts: dict = {}
    projects_ok = False
    project_model = _model("projects", "Project")
    if (
        project_model is not None
    ):  # TODO(depends on projects.Project, Dev B): field names when it lands
        try:
            rows = (
                project_model.objects.exclude(status="COMPLETED")
                .values("project_manager")
                .annotate(
                    running=Count("id"),
                    over=Count("id", filter=Q(spent__gt=F("sanctioned_budget"))),
                )
            )
            project_counts = {r["project_manager"]: r for r in rows}
            projects_ok = True
        except FieldError:
            pass

    return {
        "data_sources": {"leads": leads_ok, "projects": projects_ok},
        "execs": [
            {
                "id": u.pk,
                "name": u.display_name,
                "open_leads": lead_counts.get(u.pk, {}).get("open", 0),
                "overdue": lead_counts.get(u.pk, {}).get("overdue", 0),
            }
            for u in execs
        ],
        "pms": [
            {
                "id": u.pk,
                "name": u.display_name,
                "running_projects": project_counts.get(u.pk, {}).get("running", 0),
                "over_budget": project_counts.get(u.pk, {}).get("over", 0),
            }
            for u in pms
        ],
    }
