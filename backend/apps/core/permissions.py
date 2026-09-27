"""Role-based DRF permissions. Roles live on `users.User.role`."""

from rest_framework.permissions import BasePermission

ADMIN = "ADMIN"
SALES_MANAGER = "SALES_MANAGER"
SALES_EXEC = "SALES_EXEC"
PROJECT_MANAGER = "PROJECT_MANAGER"


class _RolePermission(BasePermission):
    allowed_roles: tuple[str, ...] = ()

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.allowed_roles)


class IsAdmin(_RolePermission):
    allowed_roles = (ADMIN,)


class IsSalesManager(_RolePermission):
    allowed_roles = (SALES_MANAGER,)


class IsSalesExec(_RolePermission):
    allowed_roles = (SALES_EXEC,)


class IsProjectManager(_RolePermission):
    allowed_roles = (PROJECT_MANAGER,)


def HasRole(*roles: str) -> type[BasePermission]:  # noqa: N802 - factory, used like a class
    """Build a permission class allowing any of `roles`.

    Usage: permission_classes = [HasRole("ADMIN", "SALES_MANAGER")]
    """
    return type(
        "HasRole_" + "_".join(roles),
        (_RolePermission,),
        {"allowed_roles": tuple(roles)},
    )
