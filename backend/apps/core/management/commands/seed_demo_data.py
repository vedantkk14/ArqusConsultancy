"""Seed local demo data. Safe to re-run. Refuses to run unless DEBUG=True."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

# Known DEV-ONLY credentials. Documented in README.md.
DEMO_USERS = [
    # username, password, role, first name, last name, email
    ("admin", "Admin@123", "ADMIN", "Alice", "Admin", "admin@crm.local"),
    ("sales_manager", "Manager@123", "SALES_MANAGER", "Sam", "Manager", "sales.manager@crm.local"),
    ("sales_exec", "Exec@123", "SALES_EXEC", "Eva", "Exec", "sales.exec@crm.local"),
    ("project_manager", "Project@123", "PROJECT_MANAGER", "Paul", "Project", "pm@crm.local"),
]

# Forced password change on first sign-in (tests the must_change_password flow). Reset on every run.
FORCED_CHANGE_USER = (
    "newuser.demo",
    "Welcome@123",
    "SALES_EXEC",
    "Nina",
    "Newuser",
    "newuser@crm.local",
)


class Command(BaseCommand):
    help = "Create demo users (one per role) and, later, demo business data. DEBUG only."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Refusing to seed demo data because DEBUG is False.")

        users = self._seed_users()
        self._seed_forced_change_user()
        self._seed_leads(users)
        self._seed_projects(users)
        self._seed_ledgers(users)
        self._seed_payments(users)
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self._print_credentials()

    def _seed_users(self):
        User = get_user_model()
        users = {}
        for username, password, role, first, last, email in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"first_name": first, "last_name": last, "email": email, "role": role},
            )
            user.role = role
            user.set_password(password)
            if role == "ADMIN":
                user.is_staff = user.is_superuser = True  # lets admin use /admin/
            user.save()
            users[role] = user
            self.stdout.write(f"  {'created' if created else 'updated'} {username} ({role})")
        return users

    def _seed_forced_change_user(self):
        from apps.users.services import set_temporary_password

        User = get_user_model()
        username, password, role, first, last, email = FORCED_CHANGE_USER
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"first_name": first, "last_name": last, "email": email, "role": role},
        )
        set_temporary_password(user, password)  # also sets must_change_password=True
        self.stdout.write(
            f"  {'created' if created else 'reset'} {username} (must change password)"
        )

    def _print_credentials(self):
        rows = [(u, p, r) for u, p, r, *_ in DEMO_USERS]
        forced_user, forced_password = FORCED_CHANGE_USER[:2]
        rows.append((forced_user, forced_password, "SALES_EXEC, must change password"))
        width = max(len(u) for u, _, _ in rows)
        self.stdout.write("")
        self.stdout.write("Demo logins (dev only; sign in with the username or the email):")
        for username, password, role in rows:
            self.stdout.write(f"  {username.ljust(width)}  {password.ljust(12)}  {role}")

    # --- TODO sections: each dev fills in their own, keeping the command idempotent ----------

    def _seed_leads(self, users):
        # TODO(Dev A): create demo leads in various statuses, owned by users["SALES_EXEC"].
        pass

    def _seed_projects(self, users):
        # TODO(Dev B): create demo projects from won leads, assigned to users["PROJECT_MANAGER"].
        pass

    def _seed_ledgers(self, users):
        # TODO(Dev C): create a Ledger (with total amount) for each won lead.
        pass

    def _seed_payments(self, users):
        # TODO(Dev C): create demo payments against the ledgers.
        pass
