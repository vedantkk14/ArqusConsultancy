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
    # Set when an admin gives the user a temporary password; the app forces a change first.
    must_change_password = models.BooleanField(default=False)

    objects = UserManager()

    @property
    def display_name(self) -> str:
        return self.get_full_name() or self.username

    def __str__(self) -> str:
        return f"{self.display_name} ({self.role})"


class PasswordResetOtp(models.Model):
    """A one-time sign-in code for "forgot password". Only a hash of the code is stored."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reset_otps")
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Password reset code for user {self.user_id}"
