from django.contrib import admin

from .models import Interaction, Lead, MessageLog, Opportunity, WhatsAppTemplate


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "assigned_to", "created_at")
    list_filter = ("source",)
    search_fields = ("name", "phone", "email")


@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):
    list_display = ("lead", "sequence_no", "status", "assigned_to", "next_followup_at", "created_at")
    list_filter = ("status",)
    search_fields = ("lead__name", "lead__phone")


@admin.register(Interaction)
class InteractionAdmin(admin.ModelAdmin):
    list_display = ("opportunity", "type", "created_by", "created_at")
    list_filter = ("type",)

    def has_change_permission(self, request, obj=None):
        return False  # append-only

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(WhatsAppTemplate)
admin.site.register(MessageLog)
