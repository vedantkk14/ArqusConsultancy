"""Abstract base models shared by every app."""

from django.conf import settings
from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SoftDeleteQuerySet(models.QuerySet):
    def delete(self):
        return self.update(is_deleted=True, deleted_at=timezone.now())

    def hard_delete(self):
        return super().delete()


class SoftDeleteManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    """Default manager: hides soft-deleted rows."""

    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class SoftDeleteModel(models.Model):
    """Rows are flagged, never removed. Use `all_objects` to see deleted rows too."""

    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = SoftDeleteManager()
    all_objects = SoftDeleteQuerySet.as_manager()

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])

    def hard_delete(self, using=None, keep_parents=False):
        return super().delete(using=using, keep_parents=keep_parents)

    def restore(self):
        self.is_deleted = False
        self.deleted_at = None
        self.save(update_fields=["is_deleted", "deleted_at"])


class AuditLog(models.Model):
    """Who changed what, when. Written by core/signals.py for a configurable allowlist of models."""

    class Action(models.TextChoices):
        CREATE = "CREATE", "Create"
        UPDATE = "UPDATE", "Update"
        DELETE = "DELETE", "Delete"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )  # null: a system action (seed, management command, background job)
    action = models.CharField(max_length=10, choices=Action.choices)
    model_label = models.CharField(max_length=100)  # e.g. "leads.Lead"
    object_id = models.CharField(max_length=64)
    object_repr = models.CharField(max_length=200)
    changes = models.JSONField(
        default=dict, blank=True
    )  # field -> {"old", "new"}, values <= 200 chars
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["model_label", "-created_at"], name="audit_model_time"),
            models.Index(fields=["actor", "-created_at"], name="audit_actor_time"),
        ]

    def __str__(self) -> str:
        return f"{self.action} {self.model_label}#{self.object_id}"
