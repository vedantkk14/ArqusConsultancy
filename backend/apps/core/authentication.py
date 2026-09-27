from rest_framework_simplejwt.authentication import JWTAuthentication

from .audit_context import set_actor


class AuditJWTAuthentication(JWTAuthentication):
    """JWT auth that also tells the audit log who is acting (DRF authenticates inside the view)."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            set_actor(result[0])
        return result
