from django.contrib import admin

from .models import Interaction, Lead, MessageLog, WhatsAppTemplate


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "status", "assigned_to", "next_followup_at", "created_at")
    list_filter = ("status", "source")
    search_fields = ("name", "phone", "email")


@admin.register(Interaction)
class InteractionAdmin(admin.ModelAdmin):
    list_display = ("lead", "type", "created_by", "created_at")
    list_filter = ("type",)

    def has_change_permission(self, request, obj=None):
        return False  # append-only

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(WhatsAppTemplate)
admin.site.register(MessageLog)
