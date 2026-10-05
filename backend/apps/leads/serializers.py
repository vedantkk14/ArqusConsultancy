"""Separate light list, detail, create and exec-update serializers.

Privacy: Exec responses never contain ledger, payment, project or total_amount keys (not even null).
`finance` and the deal links (project/ledger) are added in the view only for the roles allowed.

A lead row shows the client plus its CURRENT deal (status, follow-up, proposed amount...): those
are annotations on the lead queryset (selectors.with_current_opportunity), not Lead fields.
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from . import services
from .models import (
    CallScript,
    EmailTemplate,
    Interaction,
    InteractionType,
    Lead,
    LeadSource,
    LeadStatus,
    LostReason,
    MessageLog,
    Opportunity,
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


def days_overdue(deal) -> int:
    """`deal`: an Opportunity, or a Lead annotated with its current deal."""
    when = getattr(deal, "next_followup_at", None)
    if not when or deal.status in CLOSED_STATUSES or when >= timezone.now():
        return 0
    today = timezone.now().astimezone(business_tz()).date()
    return max(1, (today - when.astimezone(business_tz()).date()).days)


class LeadListSerializer(serializers.ModelSerializer):
    assigned_to = PersonSerializer(allow_null=True, read_only=True)
    source_label = serializers.CharField(source="get_source_display", read_only=True)
    # The current deal's fields (annotations, see selectors.with_current_opportunity).
    status = serializers.CharField(read_only=True, allow_null=True)
    next_followup_at = serializers.DateTimeField(read_only=True, allow_null=True)
    proposed_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, allow_null=True
    )
    won_at = serializers.DateTimeField(read_only=True, allow_null=True)
    lost_reason = serializers.CharField(read_only=True, allow_null=True)
    current_opportunity_id = serializers.IntegerField(read_only=True, allow_null=True)
    deals_count = serializers.IntegerField(read_only=True, default=1)
    last_activity_at = serializers.DateTimeField(read_only=True, allow_null=True)
    days_overdue = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()
    finalized = serializers.SerializerMethodField()
    final_amount = serializers.SerializerMethodField()

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
            "allowed_transitions",
            "finalized",
            "final_amount",
            "current_opportunity_id",
            "deals_count",
        ]

    def get_days_overdue(self, lead) -> int:
        return days_overdue(lead)

    def get_finalized(self, lead):
        return getattr(lead, "is_finalized", None)

    def get_final_amount(self, lead):
        value = getattr(lead, "final_amount", None)
        return None if value is None else f"{value:.2f}"

    def to_representation(self, lead):
        data = super().to_representation(lead)
        request = self.context.get("request")
        # Only roles allowed to see the final amount learn whether it is finalized.
        if request is None or not services.can_see_final_amount(request.user):
            data.pop("finalized", None)
            data.pop("final_amount", None)
        return data

    def get_allowed_transitions(self, lead) -> list[str]:
        return services.allowed_transitions(lead, self.context["request"].user)


class LeadDetailSerializer(LeadListSerializer):
    created_by = PersonSerializer(allow_null=True, read_only=True)
    lost_note = serializers.CharField(read_only=True, allow_null=True)
    interactions_count = serializers.IntegerField(read_only=True)

    class Meta(LeadListSerializer.Meta):
        fields = LeadListSerializer.Meta.fields + [
            "requirements",
            "lost_note",
            "created_by",
            "updated_at",
            "interactions_count",
        ]


class LeadWriteSerializer(serializers.ModelSerializer):
    """Create and manager/admin edit."""

    phone = PhoneField(max_length=30)
    # Deal fields: saved on the lead's current opportunity (services.DEAL_FIELDS).
    next_followup_at = serializers.DateTimeField(required=False, allow_null=True)
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

    next_followup_at = serializers.DateTimeField(required=False, allow_null=True)
    proposed_amount = serializers.DecimalField(**MONEY, required=False, allow_null=True)
    requirements = serializers.CharField(
        max_length=REQUIREMENTS_MAX, required=False, allow_blank=True
    )

    class Meta:
        model = Lead
        fields = ["email", "requirements", "next_followup_at", "proposed_amount"]


class OpportunitySerializer(serializers.ModelSerializer):
    """One deal. Project/ledger links and the finalized total are added in the view by role."""

    assigned_to = PersonSerializer(allow_null=True, read_only=True)
    created_by = PersonSerializer(allow_null=True, read_only=True)
    proposed_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, allow_null=True
    )
    days_overdue = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()
    is_open = serializers.SerializerMethodField()

    class Meta:
        model = Opportunity
        fields = [
            "id",
            "lead",
            "sequence_no",
            "status",
            "assigned_to",
            "next_followup_at",
            "days_overdue",
            "proposed_amount",
            "won_at",
            "lost_reason",
            "lost_note",
            "requirements",
            "created_by",
            "created_at",
            "updated_at",
            "allowed_transitions",
            "is_current",
            "is_open",
        ]

    def get_days_overdue(self, deal) -> int:
        return days_overdue(deal)

    def get_allowed_transitions(self, deal) -> list[str]:
        return services.allowed_transitions(deal, self.context["request"].user)

    def get_is_current(self, deal) -> bool:
        return deal.pk == deal.lead.current_opportunity_id

    def get_is_open(self, deal) -> bool:
        return services.is_open(deal)


class OpportunityCreateSerializer(serializers.Serializer):
    assigned_to = serializers.IntegerField(required=False, allow_null=True)
    requirements = serializers.CharField(
        max_length=REQUIREMENTS_MAX, required=False, allow_blank=True
    )
    next_followup_at = serializers.DateTimeField(required=False, allow_null=True)


class OpportunityUpdateSerializer(serializers.Serializer):
    next_followup_at = serializers.DateTimeField(required=False, allow_null=True)
    proposed_amount = serializers.DecimalField(**MONEY, required=False, allow_null=True)


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
    message = serializers.CharField(required=False, allow_blank=True, max_length=4000)


class WhatsAppTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppTemplate
        fields = ["id", "name", "body"]


class EmailSerializer(serializers.Serializer):
    template_id = serializers.IntegerField()
    message = serializers.CharField(required=False, allow_blank=True, max_length=10000)


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = ["id", "name", "subject", "body"]


class CallScriptSerializer(serializers.ModelSerializer):
    class Meta:
        model = CallScript
        fields = ["id", "name", "body"]


class CallLogSerializer(serializers.Serializer):
    script_id = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=4000)


class MessageLogLeadSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    phone = serializers.CharField()


class MessageLogSerializer(serializers.ModelSerializer):
    lead = serializers.SerializerMethodField()
    created_by = PersonSerializer(allow_null=True, read_only=True)
    template_name = serializers.SerializerMethodField()

    class Meta:
        model = MessageLog
        fields = [
            "id",
            "lead",
            "channel",
            "template_name",
            "subject",
            "rendered_text",
            "status",
            "created_by",
            "created_at",
        ]

    def get_lead(self, message) -> dict:
        return MessageLogLeadSerializer(message.opportunity.lead).data

    def get_template_name(self, message) -> str | None:
        template = message.template or message.email_template
        return template.name if template else None


class AssigneeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source="display_name")
    role = serializers.CharField()
    open_count = serializers.IntegerField()
