"""Two families of serializers: PM (allowlist, no finance, no lead data) and ADMIN (adds finance).

PM serializers must never gain a field that reveals the deal total, payments, margin or the lead.
"""

import re
from datetime import timedelta
from decimal import Decimal

from rest_framework import serializers

from apps.core.permissions import ADMIN

from . import rules, selectors
from .models import Expense, ExpenseCategory, Project, ProjectEvent


class MoneyField(serializers.Field):
    """A positive amount from a string (or int), up to 10 digits and 2 decimals. No floats."""

    default_error_messages = {
        "invalid": "Enter an amount above zero, with up to 10 digits and 2 decimals.",
    }

    def to_internal_value(self, data):
        if isinstance(data, bool) or isinstance(data, float):
            self.fail("invalid")
        if isinstance(data, int):
            data = str(data)
        if not isinstance(data, str):
            self.fail("invalid")
        text = data.strip()
        if not re.fullmatch(rf"\d{{1,{rules.MAX_AMOUNT_DIGITS}}}(\.\d{{1,2}})?", text):
            self.fail("invalid")
        value = Decimal(text)
        if value <= 0:
            self.fail("invalid")
        return value.quantize(Decimal("0.01"))

    def to_representation(self, value):
        return selectors.money_str(value)


def _user_ref(user) -> dict | None:
    return {"id": user.pk, "name": user.display_name} if user else None


# ---- Projects (output) ----------


class ProjectPMSerializer(serializers.ModelSerializer):
    """Everything a PM may see. Objects must come from budget_usage_qs (annotated `spent`)."""

    pm_name = serializers.SerializerMethodField()
    sanctioned_budget = serializers.SerializerMethodField()
    spent = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    usage_pct = serializers.SerializerMethodField()
    state = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            "id",
            "name",
            "client_name",
            "status",
            "start_date",
            "expected_end_date",
            "completed_at",
            "created_at",
            "pm_name",
            "sanctioned_budget",
            "spent",
            "remaining",
            "usage_pct",
            "state",
        )

    def get_pm_name(self, obj):
        return obj.pm.display_name if obj.pm else None

    def get_sanctioned_budget(self, obj):
        return selectors.money_str(obj.sanctioned_budget)

    def get_spent(self, obj):
        return selectors.money_str(obj.spent)

    def get_remaining(self, obj):
        return selectors.money_str(selectors.remaining(obj.spent, obj.sanctioned_budget))

    def get_usage_pct(self, obj):
        return selectors.usage_pct(obj.spent, obj.sanctioned_budget)

    def get_state(self, obj):
        return selectors.budget_state(obj.spent, obj.sanctioned_budget)


class ProjectPMDetailSerializer(ProjectPMSerializer):
    allowed_actions = serializers.SerializerMethodField()

    class Meta(ProjectPMSerializer.Meta):
        fields = ProjectPMSerializer.Meta.fields + ("scope", "allowed_actions")

    def get_allowed_actions(self, obj):
        return selectors.allowed_actions(self.context["request"].user, obj)


class ProjectAdminSerializer(ProjectPMSerializer):
    pm = serializers.SerializerMethodField()

    class Meta(ProjectPMSerializer.Meta):
        fields = ProjectPMSerializer.Meta.fields + ("pm",)

    def get_pm(self, obj):
        return _user_ref(obj.pm)


class ProjectAdminDetailSerializer(ProjectAdminSerializer):
    allowed_actions = serializers.SerializerMethodField()
    lead_id = serializers.IntegerField(read_only=True)
    finance = serializers.SerializerMethodField()

    class Meta(ProjectAdminSerializer.Meta):
        fields = ProjectAdminSerializer.Meta.fields + (
            "scope",
            "allowed_actions",
            "lead_id",
            "finance",
        )

    def get_allowed_actions(self, obj):
        return selectors.allowed_actions(self.context["request"].user, obj)

    def get_finance(self, obj):
        from . import integrations

        raw = integrations.finance_for(obj.lead)
        if raw is None:
            return None
        return {
            "total_amount": selectors.money_str(raw["total_amount"]),
            "received": None if raw["received"] is None else selectors.money_str(raw["received"]),
            "outstanding": (
                None if raw["outstanding"] is None else selectors.money_str(raw["outstanding"])
            ),
            "finalized": raw["finalized"],
            **selectors.project_margins(raw, obj.spent, obj.sanctioned_budget),
        }


def project_serializer(user, detail: bool = False):
    if user.role == ADMIN:
        return ProjectAdminDetailSerializer if detail else ProjectAdminSerializer
    return ProjectPMDetailSerializer if detail else ProjectPMSerializer


class EventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectEvent
        fields = ("id", "type", "actor_name", "data", "created_at")

    def get_actor_name(self, obj):
        return obj.actor.display_name if obj.actor else None


# ---- Expenses (output) ----------


class ExpenseSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    amount = serializers.SerializerMethodField()
    has_receipt = serializers.SerializerMethodField()
    logged_by = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = (
            "id",
            "project",
            "project_name",
            "category",
            "category_label",
            "amount",
            "spent_on",
            "vendor",
            "description",
            "has_receipt",
            "receipt_kind",
            "receipt_type",
            "is_void",
            "void_reason",
            "is_override",
            "logged_by",
            "created_at",
            "can_edit",
        )

    def get_amount(self, obj):
        return selectors.money_str(obj.amount)

    def get_has_receipt(self, obj):
        return bool(obj.receipt)

    def get_logged_by(self, obj):
        return _user_ref(obj.logged_by)

    def get_can_edit(self, obj):
        return selectors.can_change_expense(self.context["request"].user, obj)


class ExpenseAdminSerializer(ExpenseSerializer):
    class Meta(ExpenseSerializer.Meta):
        fields = ExpenseSerializer.Meta.fields + ("override_reason",)


def expense_serializer(user):
    return ExpenseAdminSerializer if user.role == ADMIN else ExpenseSerializer


# ---- Input ----------


class ConvertSerializer(serializers.Serializer):
    lead = serializers.IntegerField(min_value=1)
    name = serializers.CharField(max_length=200)
    sanctioned_budget = MoneyField()
    pm = serializers.IntegerField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    expected_end_date = serializers.DateField(required=False, allow_null=True)
    scope = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class ProjectUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, required=False)
    start_date = serializers.DateField(required=False, allow_null=True)
    expected_end_date = serializers.DateField(required=False, allow_null=True)
    scope = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class BudgetSerializer(serializers.Serializer):
    sanctioned_budget = MoneyField()
    reason = serializers.CharField(max_length=300)


class AssignPMSerializer(serializers.Serializer):
    pm = serializers.IntegerField(allow_null=True)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class ExpenseWriteSerializer(serializers.Serializer):
    amount = MoneyField()
    category = serializers.ChoiceField(choices=ExpenseCategory.choices)
    spent_on = serializers.DateField()
    vendor = serializers.CharField(required=False, allow_blank=True, max_length=150)
    description = serializers.CharField(
        required=False, allow_blank=True, max_length=rules.DESCRIPTION_MAX
    )
    admin_override = serializers.BooleanField(required=False)
    override_reason = serializers.CharField(required=False, allow_blank=True, max_length=300)
    receipt = serializers.FileField(required=False, allow_empty_file=False)

    def validate_spent_on(self, value):
        today = selectors.business_today()
        if value > today:
            raise serializers.ValidationError("The date cannot be in the future.")
        if value < today - timedelta(days=rules.BACKDATE_DAYS):
            raise serializers.ValidationError(
                f"The date cannot be more than {rules.BACKDATE_DAYS} days ago."
            )
        return value


class AlertSerializer(ProjectAdminSerializer):
    over_by = serializers.SerializerMethodField()

    class Meta(ProjectAdminSerializer.Meta):
        fields = ProjectAdminSerializer.Meta.fields + ("over_by",)

    def get_over_by(self, obj):
        return selectors.money_str(max(obj.spent - obj.sanctioned_budget, Decimal("0")))
