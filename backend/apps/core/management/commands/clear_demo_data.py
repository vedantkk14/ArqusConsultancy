"""Remove every business record (leads, accounts, projects, notifications, audit log) so each
page starts empty. User accounts are kept so people can still sign in.
Refill with `seed_demo_data`. DEBUG only.
"""

import shutil

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import models, transaction

# Children before parents: several links are PROTECT.
ORDER = [
    "accounts.Payment",
    "accounts.LedgerEvent",
    "accounts.Ledger",
    "projects.Expense",
    "projects.ProjectEvent",
    "projects.Project",
    "leads.MessageLog",
    "leads.Interaction",
    "leads.Lead",
    "notifications.Notification",
    "core.AuditLog",
]
UPLOAD_DIRS = ["receipts", "payment_proofs"]


class Command(BaseCommand):
    help = "Delete all business data (keeps users). DEBUG only."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Do not ask for confirmation.")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Refusing to clear data because DEBUG is False.")
        if not options["yes"] and input("Delete all business data (users are kept)? [y/N] ") != "y":
            self.stdout.write("Nothing deleted.")
            return
        with transaction.atomic():
            for label in ORDER:
                try:
                    model = apps.get_model(label)
                except LookupError:
                    continue
                # The plain QuerySet.delete, so soft-delete models are really removed.
                count, _ = models.QuerySet.delete(model._base_manager.all())
                self.stdout.write(f"  {label}: {count} deleted")
        for folder in UPLOAD_DIRS:
            shutil.rmtree(settings.MEDIA_ROOT / folder, ignore_errors=True)
        self.stdout.write(
            self.style.SUCCESS("Demo data cleared. Run seed_demo_data to add it again.")
        )
