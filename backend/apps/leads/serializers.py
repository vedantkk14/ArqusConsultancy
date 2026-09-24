"""Separate light list, detail, create and exec-update serializers.

Privacy: Exec responses never contain ledger, payment, project or total_amount keys (not even null).
`finance` is added in the view only for FINAL_AMOUNT_VISIBLE_TO roles.
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from . import services
from .models import (
    Interaction,
    InteractionType,
    Lead,
    LeadSource,
    LeadStatus,
    LostReason,
    WhatsAppTemplate,
)
from .selectors import CLOSED_STATUSES, business_tz
from .utils import InvalidPhone, normalize_phone

MONEY = {
    "max_digits": 12,
    "decimal_places": 2,
    "min_value": Decimal("0.01"),
    "coerce_to_string": True,
}
REQUIREMENTS_MAX = 500


class PersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source="display_name")


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        try:
            return normalize_phone(super().to_internal_value(data))
        except InvalidPhone as exc:
            raise serializers.ValidationError(str(exc)) from exc


def days_overdue(lead: Lead) -> int:
    when = lead.next_followup_at
    if not when or lead.status in CLOSED_STATUSES or when >= timezone.now():
        return 0
    today = timezone.now().astimezone(business_tz()).date()
    return max(1, (today - when.astimezone(business_tz()).date()).days)


class LeadListSerializer(serializers.ModelSerializer):
    assigned_to = PersonSerializer(allow_null=True, read_only=True)
    source_label = serializers.CharField(source="get_source_display", read_only=True)
    proposed_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    last_activity_at = serializers.DateTimeField(read_only=True, allow_null=True)
    days_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "source",
            "source_label",
            "source_other",
            "status",
            "assigned_to",
            "next_followup_at",
            "days_overdue",
            "proposed_amount",
            "last_activity_at",
            "won_at",
            "lost_reason",
            "created_at",
        ]

    def get_days_overdue(self, lead) -> int:
        return days_overdue(lead)


class LeadDetailSerializer(LeadListSerializer):
    created_by = PersonSerializer(allow_null=True, read_only=True)
    allowed_transitions = serializers.SerializerMethodField()
    interactions_count = serializers.IntegerField(read_only=True)

    class Meta(LeadListSerializer.Meta):
        fields = LeadListSerializer.Meta.fields + [
            "requirements",
            "lost_note",
            "created_by",
            "updated_at",
            "allowed_transitions",
            "interactions_count",
        ]

    def get_allowed_transitions(self, lead) -> list[str]:
        return services.allowed_transitions(lead, self.context["request"].user)


class LeadWriteSerializer(serializers.ModelSerializer):
    """Create and manager/admin edit."""

    phone = PhoneField(max_length=30)
    proposed_amount = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    requirements = serializers.CharField(
        max_length=REQUIREMENTS_MAX, required=False, allow_blank=True
    )
    assigned_to = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = Lead
        fields = [
            "name",
            "phone",
            "email",
            "source",
            "source_other",
            "requirements",
            "assigned_to",
            "next_followup_at",
            "proposed_amount",
        ]
        extra_kwargs = {"source": {"required": False}}

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter the lead's name.")
        return value

    def validate(self, attrs):
        if "source" in attrs and attrs["source"] != LeadSource.OTHER:
            attrs["source_other"] = ""
        return attrs


class LeadManagerUpdateSerializer(LeadWriteSerializer):
    class Meta(LeadWriteSerializer.Meta):
        fields = [f for f in LeadWriteSerializer.Meta.fields if f != "assigned_to"]


class LeadExecUpdateSerializer(serializers.ModelSerializer):
    """What a Sales Exec may change on their own lead through PATCH."""

    proposed_amount = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    requirements = serializers.CharField(
        max_length=REQUIREMENTS_MAX, required=False, allow_blank=True
    )

    class Meta:
        model = Lead
        fields = ["email", "requirements", "next_followup_at", "proposed_amount"]


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=LeadStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    lost_reason = serializers.ChoiceField(
        choices=LostReason.choices, required=False, allow_blank=True
    )
    lost_note = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    proposed_amount = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    next_followup_at = serializers.DateTimeField(required=False, allow_null=True)


class InteractionSerializer(serializers.ModelSerializer):
    created_by = PersonSerializer(allow_null=True, read_only=True)

    class Meta:
        model = Interaction
        fields = [
            "id",
            "type",
            "notes",
            "created_by",
            "created_at",
            "from_status",
            "to_status",
            "meta",
        ]


class InteractionCreateSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=InteractionType.choices)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    next_followup_at = serializers.DateTimeField(required=False, allow_null=True)
    new_status = serializers.ChoiceField(
        choices=LeadStatus.choices, required=False, allow_null=True
    )
    lost_reason = serializers.ChoiceField(
        choices=LostReason.choices, required=False, allow_blank=True
    )
    lost_note = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    proposed_amount = serializers.DecimalField(**MONEY, required=False, allow_null=True)

    def validate_type(self, value):
        if value not in services.USER_INTERACTION_TYPES:
            raise serializers.ValidationError("This activity type is written by the system.")
        return value


class AssignSerializer(serializers.Serializer):
    assigned_to = serializers.IntegerField()


class BulkAssignSerializer(AssignSerializer):
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class FinalizeSerializer(serializers.Serializer):
    amount = serializers.DecimalField(**MONEY)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class WhatsAppSerializer(serializers.Serializer):
    template_id = serializers.IntegerField()


class WhatsAppTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppTemplate
        fields = ["id", "name", "body"]


class AssigneeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source="display_name")
    open_count = serializers.IntegerField()
