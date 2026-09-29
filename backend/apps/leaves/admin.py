from django.contrib import admin

from .models import Holiday, LeaveRequest


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ("name", "date")
    ordering = ("date",)


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "start_date", "end_date", "status", "decided_by", "created_at")
    list_filter = ("status",)
