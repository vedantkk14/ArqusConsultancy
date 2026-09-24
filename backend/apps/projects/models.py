"""Projects and expenses (Dev B). Never store spent or remaining: they are always aggregated."""

import uuid
from pathlib import Path

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models

from apps.core.models import TimeStampedModel


class ProjectStatus(models.TextChoices):
    RUNNING = "RUNNING", "Running"
    COMPLETED = "COMPLETED", "Completed"


class AlertState(models.TextChoices):
    OK = "OK", "On track"
    WARN = "WARN", "Near limit"
    OVER = "OVER", "Over budget"


class ExpenseCategory(models.TextChoices):
    MATERIALS = "MATERIALS", "Materials"
    LABOUR = "LABOUR", "Labour"
    TRANSPORT = "TRANSPORT", "Transport"
    EQUIPMENT = "EQUIPMENT", "Equipment"
    FOOD = "FOOD", "Food"
    PERMITS = "PERMITS", "Permits"
    OTHER = "OTHER", "Other"


class EventType(models.TextChoices):
    CREATED = "CREATED", "Project created"
    PM_ASSIGNED = "PM_ASSIGNED", "Project manager assigned"
    BUDGET_CHANGED = "BUDGET_CHANGED", "Budget changed"
    EXPENSE_ADDED = "EXPENSE_ADDED", "Expense added"
    EXPENSE_EDITED = "EXPENSE_EDITED", "Expense edited"
    EXPENSE_VOIDED = "EXPENSE_VOIDED", "Expense voided"
    COMPLETED = "COMPLETED", "Project completed"
    REOPENED = "REOPENED", "Project reopened"


class ReceiptStorage(FileSystemStorage):
    """Stored under MEDIA_ROOT with no public URL: only /expenses/<id>/receipt serves them."""

    def url(self, name):
        raise ValueError("Receipts have no public URL.")


def receipt_path(instance, filename: str) -> str:
    return f"receipts/{instance.project_id}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}"


class Project(TimeStampedModel):
    name = models.CharField(max_length=200)
    client_name = models.CharField(max_length=150)  # copied from the lead when converted
    lead = models.OneToOneField(
        "leads.Lead", on_delete=models.PROTECT, related_name="project", null=True, blank=True
    )
    pm = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="managed_projects",
    )
    status = models.CharField(
        max_length=12, choices=ProjectStatus.choices, default=ProjectStatus.RUNNING
    )
    sanctioned_budget = models.DecimalField(max_digits=12, decimal_places=2)
    start_date = models.DateField(null=True, blank=True)
    expected_end_date = models.DateField(null=True, blank=True)
    scope = models.TextField(blank=True)
    alert_state = models.CharField(max_length=5, choices=AlertState.choices, default=AlertState.OK)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "pm"], name="project_status_pm")]

    def __str__(self) -> str:
        return self.name


class Expense(TimeStampedModel):
    project = models.ForeignKey(Project, on_delete=models.PROTECT, related_name="expenses")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.CharField(max_length=12, choices=ExpenseCategory.choices)
    spent_on = models.DateField()
    vendor = models.CharField(max_length=150, blank=True)
    description = models.CharField(max_length=500, blank=True)
    receipt = models.FileField(
        upload_to=receipt_path, storage=ReceiptStorage, blank=True, max_length=255
    )
    receipt_kind = models.CharField(max_length=5, blank=True)  # "image" or "pdf"
    receipt_type = models.CharField(max_length=30, blank=True)  # detected MIME type
    logged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    is_override = models.BooleanField(default=False)
    override_reason = models.CharField(max_length=300, blank=True)
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=300, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-spent_on", "-id"]
        indexes = [
            models.Index(fields=["project", "is_void", "spent_on"], name="expense_proj_void_date"),
            models.Index(fields=["logged_by"], name="expense_logged_by"),
        ]

    def __str__(self) -> str:
        return f"{self.category} {self.amount} on project {self.project_id}"


class ProjectEvent(models.Model):
    """Append-only timeline. Never edited or deleted."""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="events")
    type = models.CharField(max_length=20, choices=EventType.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["project", "-created_at"], name="event_project_time")]

    def __str__(self) -> str:
        return f"{self.type} on project {self.project_id}"
