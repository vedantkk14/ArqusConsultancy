"""Routers shared by the platform apps."""

from rest_framework.routers import SimpleRouter


class OptionalSlashRouter(SimpleRouter):
    """/things and /things/ both resolve (DRF only takes a plain yes/no for the slash)."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = "/?"
