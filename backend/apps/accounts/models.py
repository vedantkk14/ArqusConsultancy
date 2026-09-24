# ruff: noqa: E501
"""Ledger and payments (Dev B). Owns the Total Project Amount. received/outstanding are never stored."""

import uuid
from pathlib import Path

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models

from apps.core.models import TimeStampedModel


class PaymentMode(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"
    UPI = "UPI", "UPI"
    CHEQUE = "CHEQUE", "Cheque"
    CARD = "CARD", "Card"
    OTHER = "OTHER", "Other"


class LedgerState(models.TextChoices):
    AWAITING_FINALIZATION = "AWAITING_FINALIZATION", "Awaiting finalization"
    UNPAID = "UNPAID", "Unpaid"
    PARTIAL = "PARTIAL", "Partial"
    PAID = "PAID", "Paid"


class LedgerEventType(models.TextChoices):
    CREATED = "CREATED", "Ledger created"
    FINALIZED = "FINALIZED", "Total finalized"
    TOTAL_REVISED = "TOTAL_REVISED", "Total revised"
    PAYMENT_ADDED = "PAYMENT_ADDED", "Payment recorded"
    PAYMENT_VOIDED = "PAYMENT_VOIDED", "Payment voided"
    REMINDER_SENT = "REMINDER_SENT", "Reminder sent"


class ProofStorage(FileSystemStorage):
    """Stored under MEDIA_ROOT with no public URL: only /payments/<id>/proof serves them."""

    def url(self, name):
        raise ValueError("Payment proofs have no public URL.")


def proof_path(instance, filename: str) -> str:
    return f"payment_proofs/{instance.ledger_id}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}"


class Ledger(TimeStampedModel):
    lead = models.OneToOneField("leads.Lead", on_delete=models.PROTECT, related_name="ledger")
    # The Exec's proposal until finalized, then the agreed Total Project Amount.
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    finalized_at = models.DateTimeField(null=True, blank=True)
    finalized_on = models.DateField(null=True, blank=True)  # the same moment as a business date
    finalized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    finalize_note = models.CharField(max_length=300, blank=True)
    overdue_notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["finalized_at"], name="ledger_finalized_at")]

    def __str__(self) -> str:
        return f"Ledger for lead {self.lead_id}"


class Payment(TimeStampedModel):
    ledger = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    mode = models.CharField(max_length=14, choices=PaymentMode.choices)
    reference = models.CharField(max_length=100, blank=True)
    received_on = models.DateField()
    note = models.CharField(max_length=300, blank=True)
    proof = models.FileField(upload_to=proof_path, storage=ProofStorage, blank=True, max_length=255)
    proof_kind = models.CharField(max_length=5, blank=True)  # "image" or "pdf"
    proof_type = models.CharField(max_length=30, blank=True)  # detected MIME type
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=300, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-received_on", "-id"]
        indexes = [
            models.Index(
                fields=["ledger", "is_void", "received_on"], name="payment_ledger_void_date"
            ),
            models.Index(fields=["received_on"], name="payment_received_on"),
        ]

    def __str__(self) -> str:
        return f"{self.amount} on ledger {self.ledger_id}"


class LedgerEvent(models.Model):
    """Append-only timeline. Never edited or deleted."""

    ledger = models.ForeignKey(Ledger, on_delete=models.CASCADE, related_name="events")
    type = models.CharField(max_length=16, choices=LedgerEventType.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["ledger", "-created_at"], name="ledgerevent_time")]

    def __str__(self) -> str:
        return f"{self.type} on ledger {self.ledger_id}"
