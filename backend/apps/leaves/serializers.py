from rest_framework import serializers

from .models import Holiday, LeaveRequest


class PersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source="display_name")
    role = serializers.CharField()
    designation = serializers.CharField(source="get_role_display", read_only=True)


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ["id", "date", "name"]


class LeaveRequestSerializer(serializers.ModelSerializer):
    user = PersonSerializer(read_only=True)
    decided_by = PersonSerializer(read_only=True, allow_null=True)
    days = serializers.IntegerField(read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            "id",
            "user",
            "start_date",
            "end_date",
            "days",
            "reason",
            "status",
            "decided_by",
            "decided_at",
            "decision_note",
            "created_at",
        ]


class LeaveCreateSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    reason = serializers.CharField(max_length=1000)

    def validate_reason(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a reason for the leave.")
        return value


class LeaveDecisionSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, max_length=300)
