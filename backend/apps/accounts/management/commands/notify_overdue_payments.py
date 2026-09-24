# ruff: noqa: E501
"""Tell every admin about ledgers that just became overdue. Safe to run daily: each ledger is announced once
(`Ledger.overdue_notified_at`); a new payment resets it."""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.accounts import selectors
from apps.accounts.models import Ledger
from apps.core.services import notify


def notify_overdue_payments() -> int:
    """Notify admins about newly overdue ledgers; returns how many ledgers were announced."""
    qs = selectors.with_figures(Ledger.objects.select_related("lead")).filter(
        selectors.overdue_q(), overdue_notified_at__isnull=True
    )
    admins = list(get_user_model().objects.filter(role="ADMIN", is_active=True))
    today = selectors.business_today()
    count = 0
    for ledger in qs:
        payload = {
            "ledger_id": ledger.pk,
            "lead_name": ledger.lead.name,
            "days_since": selectors.days_since(ledger.aging_base, today),
        }
        for admin in admins:
            notify(admin, "payment_overdue", payload)
        Ledger.objects.filter(pk=ledger.pk).update(overdue_notified_at=selectors.now())
        count += 1
    return count


class Command(BaseCommand):
    help = "Notify admins about payments that just became overdue (idempotent)."

    def handle(self, *args, **options):
        self.stdout.write(f"Announced {notify_overdue_payments()} overdue ledger(s).")
