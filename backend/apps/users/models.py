from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models


class UserManager(DjangoUserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.ADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        SALES_MANAGER = "SALES_MANAGER", "Sales Manager"
        SALES_EXEC = "SALES_EXEC", "Sales Executive"
        PROJECT_MANAGER = "PROJECT_MANAGER", "Project Manager"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.SALES_EXEC)
    phone = models.CharField(max_length=20, blank=True)
    # Percentage, e.g. 2.50 = 2.5%. Definition still open: see docs/OPEN_DECISIONS.md.
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    # Set when an admin gives the user a temporary password; the app forces a change first.
    must_change_password = models.BooleanField(default=False)

    objects = UserManager()

    @property
    def display_name(self) -> str:
        return self.get_full_name() or self.username

    def __str__(self) -> str:
        return f"{self.display_name} ({self.role})"
