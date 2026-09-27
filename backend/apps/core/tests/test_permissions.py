from types import SimpleNamespace

from apps.core.permissions import (
    HasRole,
    IsAdmin,
    IsProjectManager,
    IsSalesExec,
    IsSalesManager,
)


def _request(role=None, authenticated=True):
    user = SimpleNamespace(is_authenticated=authenticated, role=role)
    return SimpleNamespace(user=user)


def _allowed(permission_class, role, authenticated=True):
    return permission_class().has_permission(_request(role, authenticated), view=None)


def test_single_role_permissions():
    assert _allowed(IsAdmin, "ADMIN")
    assert not _allowed(IsAdmin, "SALES_EXEC")
    assert _allowed(IsSalesManager, "SALES_MANAGER")
    assert _allowed(IsSalesExec, "SALES_EXEC")
    assert _allowed(IsProjectManager, "PROJECT_MANAGER")
    assert not _allowed(IsProjectManager, "ADMIN")


def test_has_role_factory_allows_listed_roles_only():
    perm = HasRole("ADMIN", "SALES_MANAGER")
    assert _allowed(perm, "ADMIN")
    assert _allowed(perm, "SALES_MANAGER")
    assert not _allowed(perm, "SALES_EXEC")
    assert not _allowed(perm, "PROJECT_MANAGER")


def test_unauthenticated_is_always_denied():
    assert not _allowed(IsAdmin, "ADMIN", authenticated=False)
    assert not _allowed(HasRole("ADMIN"), "ADMIN", authenticated=False)
