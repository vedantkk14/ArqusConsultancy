"""Leaves module: the standard holiday calendar (admin-managed) and employee leave requests."""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Holiday(TimeStampedModel):
    """A standard holiday on the shared calendar. Only an admin may add or remove one."""

    date = models.DateField(unique=True)
    name = models.CharField(max_length=150)

    class Meta:
        ordering = ["date"]

    def __str__(self) -> str:
        return f"{self.name} ({self.date})"


class LeaveStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"


class LeaveRequest(TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="leave_requests"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(
        max_length=10, choices=LeaveStatus.choices, default=LeaveStatus.PENDING
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "-created_at"], name="leave_user_time")]

    @property
    def days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def __str__(self) -> str:
        return f"{self.user_id} {self.start_date}..{self.end_date} ({self.status})"
