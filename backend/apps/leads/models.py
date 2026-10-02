"""Sales module (Dev A): leads (clients), their opportunities (deals), interactions, WhatsApp
templates and the won-deal hand-off."""

from django.conf import settings
from django.db import models

from apps.core.models import SoftDeleteModel, TimeStampedModel


class LeadStatus(models.TextChoices):
    NEW = "NEW", "New"
    CONTACTED = "CONTACTED", "Contacted"
    INTERESTED = "INTERESTED", "Interested"
    WON = "WON", "Won"
    LOST = "LOST", "Lost"


class LostReason(models.TextChoices):
    PRICE = "PRICE", "Price"
    COMPETITOR = "COMPETITOR", "Went with a competitor"
    NO_RESPONSE = "NO_RESPONSE", "No response"
    NOT_INTERESTED = "NOT_INTERESTED", "Not interested"
    REQUIREMENT_CHANGED = "REQUIREMENT_CHANGED", "Requirement changed"
    OTHER = "OTHER", "Other"


class LeadSource(models.TextChoices):
    WEBSITE = "WEBSITE", "Website"
    REFERRAL = "REFERRAL", "Referral"
    INSTAGRAM = "INSTAGRAM", "Instagram"
    FACEBOOK = "FACEBOOK", "Facebook"
    GOOGLE_ADS = "GOOGLE_ADS", "Google Ads"
    WALK_IN = "WALK_IN", "Walk-in"
    COLD_CALL = "COLD_CALL", "Cold call"
    EVENT = "EVENT", "Event"
    OTHER = "OTHER", "Other"


class InteractionType(models.TextChoices):
    # Logged by users
    CALL = "CALL", "Call"
    WHATSAPP = "WHATSAPP", "WhatsApp"
    EMAIL = "EMAIL", "Email"
    MEETING = "MEETING", "Meeting"
    NOTE = "NOTE", "Note"
    # Written by the system only
    STATUS_CHANGE = "STATUS_CHANGE", "Status change"
    ASSIGNMENT = "ASSIGNMENT", "Assignment"
    AMOUNT_CHANGE = "AMOUNT_CHANGE", "Amount change"


class Lead(TimeStampedModel, SoftDeleteModel):
    """The permanent client record. Deal fields (status, follow-up, amounts) live on Opportunity."""

    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, db_index=True)  # normalised, e.g. +919876543210
    email = models.EmailField(blank=True)
    source = models.CharField(max_length=20, choices=LeadSource.choices, default=LeadSource.OTHER)
    source_other = models.CharField(max_length=100, blank=True)  # free text when source is OTHER
    requirements = models.TextField(blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_leads",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_leads",
    )
    # The most recently created opportunity (only the latest one can be open). Denormalised so
    # list filters and aggregates can join it instead of running a subquery per row.
    current_opportunity = models.ForeignKey(
        "Opportunity", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class Opportunity(TimeStampedModel, SoftDeleteModel):
    """One deal with a lead ("Deal #2"). A lead has at most one open (not WON/LOST) at a time."""

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="opportunities")
    sequence_no = models.PositiveIntegerField()
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_opportunities",
    )
    status = models.CharField(max_length=20, choices=LeadStatus.choices, default=LeadStatus.NEW)
    next_followup_at = models.DateTimeField(null=True, blank=True)
    # The Exec's proposal only. The final Total Amount lives on accounts.Ledger (privacy shield).
    proposed_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    won_at = models.DateTimeField(null=True, blank=True)
    lost_reason = models.CharField(max_length=30, choices=LostReason.choices, blank=True)
    lost_note = models.TextField(blank=True)
    requirements = models.TextField(blank=True)  # optional note given when the deal was started
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_opportunities",
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["lead", "sequence_no"], name="opp_lead_sequence")
        ]
        indexes = [
            models.Index(fields=["lead", "-created_at"], name="opp_lead_time"),
            models.Index(
                fields=["status", "assigned_to", "next_followup_at"], name="opp_status_owner_fu"
            ),
        ]

    def __str__(self) -> str:
        return f"Deal #{self.sequence_no} for lead {self.lead_id} ({self.status})"


class Interaction(models.Model):
    """Append-only timeline entry. Never edited or deleted."""

    opportunity = models.ForeignKey(
        Opportunity, on_delete=models.CASCADE, related_name="interactions"
    )
    type = models.CharField(max_length=20, choices=InteractionType.choices)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    from_status = models.CharField(max_length=20, choices=LeadStatus.choices, blank=True)
    to_status = models.CharField(max_length=20, choices=LeadStatus.choices, blank=True)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["opportunity", "-created_at"], name="interaction_opp_time")]

    def __str__(self) -> str:
        return f"{self.type} on opportunity {self.opportunity_id}"


class WhatsAppTemplate(TimeStampedModel):
    """Body placeholders: {{lead_name}}, {{exec_name}}, {{company}}."""

    name = models.CharField(max_length=100, unique=True)
    body = models.TextField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class EmailTemplate(TimeStampedModel):
    """Body/subject placeholders: {{lead_name}}, {{exec_name}}, {{company}}."""

    name = models.CharField(max_length=100, unique=True)
    subject = models.CharField(max_length=200)
    body = models.TextField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CallScript(TimeStampedModel):
    """Talking points to reference on a call. Body placeholders same as templates above."""

    name = models.CharField(max_length=100, unique=True)
    body = models.TextField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class MessageLog(models.Model):
    class Channel(models.TextChoices):
        WHATSAPP = "WHATSAPP", "WhatsApp"
        EMAIL = "EMAIL", "Email"

    class Status(models.TextChoices):
        OPENED = "OPENED", "Opened"  # wa.me/mailto link handed to the user; delivery unconfirmed
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name="messages")
    template = models.ForeignKey(WhatsAppTemplate, null=True, blank=True, on_delete=models.SET_NULL)
    email_template = models.ForeignKey(
        EmailTemplate, null=True, blank=True, on_delete=models.SET_NULL
    )
    subject = models.CharField(max_length=200, blank=True)
    rendered_text = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    channel = models.CharField(max_length=20, choices=Channel.choices, default=Channel.WHATSAPP)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPENED)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.channel} on opportunity {self.opportunity_id} ({self.status})"
