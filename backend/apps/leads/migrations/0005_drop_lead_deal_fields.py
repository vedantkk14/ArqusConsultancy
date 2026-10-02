"""Drop the deal fields from Lead and point the timeline at Opportunity only (step 3 of 3)."""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("leads", "0004_backfill_opportunities")]

    operations = [
        migrations.RemoveIndex(model_name="interaction", name="interaction_lead_time"),
        migrations.RemoveField(model_name="interaction", name="lead"),
        migrations.RemoveField(model_name="messagelog", name="lead"),
        migrations.AlterField(
            model_name="interaction",
            name="opportunity",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="interactions",
                to="leads.opportunity",
            ),
        ),
        migrations.AlterField(
            model_name="messagelog",
            name="opportunity",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="messages",
                to="leads.opportunity",
            ),
        ),
        migrations.AddIndex(
            model_name="interaction",
            index=models.Index(fields=["opportunity", "-created_at"], name="interaction_opp_time"),
        ),
        migrations.RemoveIndex(model_name="lead", name="lead_status_owner_fu"),
        migrations.RemoveField(model_name="lead", name="status"),
        migrations.RemoveField(model_name="lead", name="next_followup_at"),
        migrations.RemoveField(model_name="lead", name="proposed_amount"),
        migrations.RemoveField(model_name="lead", name="won_at"),
        migrations.RemoveField(model_name="lead", name="lost_reason"),
        migrations.RemoveField(model_name="lead", name="lost_note"),
    ]
