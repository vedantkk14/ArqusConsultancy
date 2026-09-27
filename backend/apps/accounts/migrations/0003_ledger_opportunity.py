"""Ledger belongs to a deal (leads.Opportunity), not to the lead: each existing ledger moves to its
lead's Opportunity #1, the only one that existed before opportunities were introduced."""

import django.db.models.deletion
from django.db import migrations, models


def forwards(apps, schema_editor):
    Ledger = apps.get_model("accounts", "Ledger")  # noqa: N806
    Opportunity = apps.get_model("leads", "Opportunity")  # noqa: N806
    first = dict(
        Opportunity._base_manager.filter(sequence_no=1).values_list("lead_id", "id")
    )
    for ledger in Ledger._base_manager.all().iterator():
        Ledger._base_manager.filter(pk=ledger.pk).update(opportunity_id=first[ledger.lead_id])


def backwards(apps, schema_editor):
    Ledger = apps.get_model("accounts", "Ledger")  # noqa: N806
    for ledger in Ledger._base_manager.select_related("opportunity").iterator():
        Ledger._base_manager.filter(pk=ledger.pk).update(lead_id=ledger.opportunity.lead_id)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_ledger_initial_amount"),
        ("leads", "0005_drop_lead_deal_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="ledger",
            name="opportunity",
            field=models.OneToOneField(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="ledger",
                to="leads.opportunity",
            ),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(model_name="ledger", name="lead"),
        migrations.AlterField(
            model_name="ledger",
            name="opportunity",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="ledger",
                to="leads.opportunity",
            ),
        ),
    ]
