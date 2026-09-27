from django.contrib import admin

from .models import DeviceToken, Notification

admin.site.register(Notification)
admin.site.register(DeviceToken)
