from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("CRM", {"fields": ("role", "phone", "commission_rate")}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("CRM", {"fields": ("role", "phone", "commission_rate")}),
    )
    list_display = ("username", "email", "first_name", "last_name", "role", "is_active")
    list_filter = DjangoUserAdmin.list_filter + ("role",)
