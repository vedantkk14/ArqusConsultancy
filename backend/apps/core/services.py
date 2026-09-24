"""Cross-app services. Other apps call these; they never reach into each other's models."""

import logging

logger = logging.getLogger(__name__)


def notify(user, type, payload=None):  # noqa: A002 - `type` is the agreed contract name
    """Send an in-app notification to `user`.

    Signature is the contract Leads and Projects already call. Stores a notifications.Notification
    with a title and body rendered from notifications/templates.py; push and WhatsApp come later.
    """
    from apps.notifications.services import create_notification

    notification = create_notification(user, type, payload)
    logger.info("notify user=%s type=%s", getattr(user, "pk", user), type)
    return notification
