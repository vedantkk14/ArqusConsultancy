"""The signed-in user for the request being served, so signals can record the actor."""

from contextvars import ContextVar

_actor: ContextVar = ContextVar("audit_actor", default=None)


def set_actor(user) -> None:
    _actor.set(user if getattr(user, "pk", None) else None)


def get_actor():
    return _actor.get()


def reset_actor():
    return _actor.set(None)
