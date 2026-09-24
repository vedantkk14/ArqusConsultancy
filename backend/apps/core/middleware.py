from .audit_context import _actor


class AuditActorMiddleware:
    """Every request starts with no actor and leaves none behind (threads are reused)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _actor.set(None)
        try:
            return self.get_response(request)
        finally:
            _actor.reset(token)
