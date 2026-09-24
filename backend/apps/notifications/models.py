"""In-app notifications (Dev C), written by core.services.notify()."""

from django.conf import settings
from django.db import models


class Notification(models.Model):
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    type = models.CharField(max_length=50)  # e.g. "lead_won", "budget_over", "payment_received"
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)  # small: ids and names the UI links with
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(
                fields=["recipient", "is_read", "-created_at"], name="notif_recipient_read"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.type} for user {self.recipient_id}"


class DeviceToken(models.Model):
    """Schema only: push delivery arrives with the mobile app."""

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="device_tokens"
    )
    token = models.CharField(max_length=255)
    platform = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["recipient", "token"], name="device_token_unique")
        ]

    def __str__(self) -> str:
        return f"{self.platform or 'device'} token for user {self.recipient_id}"
