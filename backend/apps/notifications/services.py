"""Business logic lives here, not in views or serializers."""

from django.db import transaction

from .models import Notification
from .templates import render, small_data


def create_notification(user, type_: str, payload: dict | None = None) -> Notification | None:
    """One notification row for `user`. Called through core.services.notify(); never from views."""
    if user is None or getattr(user, "pk", None) is None:
        return None
    title, body = render(type_, payload)
    return Notification.objects.create(
        recipient=user, type=type_, title=title, body=body, data=small_data(payload)
    )


def unread_count(user) -> int:
    return Notification.objects.filter(recipient=user, is_read=False).count()


@transaction.atomic
def mark_read(notification: Notification) -> Notification:
    if not notification.is_read:
        notification.is_read = True
        notification.save(update_fields=["is_read"])
    return notification


def mark_all_read(user) -> int:
    return Notification.objects.filter(recipient=user, is_read=False).update(is_read=True)
