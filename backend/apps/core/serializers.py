from rest_framework import serializers

"""Shared serializer helpers."""


class AuditLogSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    actor = serializers.SerializerMethodField()
    action = serializers.CharField()
    model_label = serializers.CharField()
    object_id = serializers.CharField()
    object_repr = serializers.CharField()
    changes = serializers.JSONField()
    created_at = serializers.DateTimeField()

    def get_actor(self, log):
        user = log.actor
        return {"id": user.pk, "name": user.display_name} if user else None
