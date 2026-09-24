"""Audit trail: post_save / post_delete on an allowlist of models, loaded lazily.

A model that isn't merged yet is skipped silently (apps.get_model + LookupError), so this works with
whatever exists. Passwords are never recorded. Bulk QuerySet.update() does not fire signals.
"""

import logging
from datetime import date, datetime
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.db import models, transaction
from django.db.models.signals import post_delete, post_save, pre_save

from .audit_context import get_actor

logger = logging.getLogger(__name__)

DEFAULT_AUDITED = [
    "leads.Lead",
    "leads.Interaction",
    "projects.Project",
    "projects.Expense",
    "accounts.Ledger",
    "accounts.Payment",
    "users.User",
]
#: Never recorded: secrets, and columns that change on every touch without meaning.
IGNORED_FIELDS = {"password", "updated_at", "last_login"}
VALUE_MAX = 200


def audited_labels() -> list[str]:
    return list(getattr(settings, "AUDIT_MODELS", DEFAULT_AUDITED))


def _is_secret(name: str) -> bool:
    return name == "password" or name.endswith("_password")


def _text(value):
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)[:VALUE_MAX]


def snapshot(instance) -> dict:
    """Concrete column values as short text/number/bool, minus secrets and noise. FKs by id."""
    out = {}
    for field in instance._meta.concrete_fields:
        if (
            field.name in IGNORED_FIELDS
            or _is_secret(field.name)
            or isinstance(field, models.FileField)
        ):
            continue
        out[field.attname] = _text(getattr(instance, field.attname, None))
    return out


def _write(instance, action: str, changes: dict) -> None:
    from .models import AuditLog

    try:
        with transaction.atomic():  # a failed audit write must never break the real write
            AuditLog.objects.create(
                actor=get_actor(),
                action=action,
                model_label=instance._meta.label,
                object_id=str(instance.pk),
                object_repr=str(instance)[:VALUE_MAX],
                changes=changes,
            )
    except Exception:  # noqa: BLE001
        logger.exception("audit write failed for %s", instance._meta.label)


def on_pre_save(sender, instance, raw=False, **kwargs):
    instance._audit_before = None
    if raw or instance.pk is None:
        return
    old = sender._base_manager.filter(pk=instance.pk).first()  # sees soft-deleted rows too
    instance._audit_before = snapshot(old) if old else None


def on_post_save(sender, instance, created, raw=False, **kwargs):
    if raw:
        return
    after = snapshot(instance)
    before = getattr(instance, "_audit_before", None)
    if created or before is None:
        changes = {k: {"old": None, "new": v} for k, v in after.items() if v not in (None, "")}
        _write(instance, "CREATE", changes)
        return
    changes = {k: {"old": before.get(k), "new": v} for k, v in after.items() if before.get(k) != v}
    if not changes:
        return
    flipped = changes.get("is_deleted", {}).get("new") is True  # soft delete
    _write(instance, "DELETE" if flipped else "UPDATE", changes)


def on_post_delete(sender, instance, **kwargs):
    _write(
        instance,
        "DELETE",
        {k: {"old": v, "new": None} for k, v in snapshot(instance).items() if v not in (None, "")},
    )


def register(labels: list[str] | None = None) -> list[str]:
    """Connect handlers for every allowlisted model that exists; returns those labels."""
    connected = []
    for label in labels if labels is not None else audited_labels():
        try:
            model = apps.get_model(label)
        except (LookupError, ValueError):
            continue  # TODO(depends on that app's model): picked up automatically once it exists
        uid = f"audit:{label}"
        pre_save.connect(on_pre_save, sender=model, dispatch_uid=f"{uid}:pre", weak=False)
        post_save.connect(on_post_save, sender=model, dispatch_uid=f"{uid}:save", weak=False)
        post_delete.connect(on_post_delete, sender=model, dispatch_uid=f"{uid}:del", weak=False)
        connected.append(label)
    return connected
