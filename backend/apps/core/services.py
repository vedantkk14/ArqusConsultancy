"""Cross-app services. Other apps call these; they never reach into each other's models."""
import logging

logger = logging.getLogger(__name__)


def notify(user, type, payload=None):  # noqa: A002 - `type` is the agreed contract name
    """Send a notification to `user`.

    STUB: only logs for now. Dev C replaces the body with persistence to
    notifications.Notification (and later push / WhatsApp), keeping this signature.
    """
    logger.info("notify user=%s type=%s payload=%s", getattr(user, "pk", user), type, payload)
