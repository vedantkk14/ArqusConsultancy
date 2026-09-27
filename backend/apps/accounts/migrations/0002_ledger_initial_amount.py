from django.db import migrations, models


def backfill(apps, schema_editor):
    """The first finalized amount comes from the FINALIZED event; without one, the current total."""
    Ledger = apps.get_model("accounts", "Ledger")  # noqa: N806
    LedgerEvent = apps.get_model("accounts", "LedgerEvent")  # noqa: N806
    for ledger in Ledger.objects.filter(finalized_at__isnull=False):
        event = (
            LedgerEvent.objects.filter(ledger=ledger, type="FINALIZED").order_by("created_at").first()
        )
        amount = (event.data or {}).get("amount") if event else None
        ledger.initial_amount = amount or ledger.total_amount
        ledger.save(update_fields=["initial_amount"])


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="ledger",
            name="initial_amount",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
