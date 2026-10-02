"""Project comes from a deal (leads.Opportunity), not from the lead: each existing project moves to
its lead's Opportunity #1, the only one that existed before opportunities were introduced."""

import django.db.models.deletion
from django.db import migrations, models


def forwards(apps, schema_editor):
    Project = apps.get_model("projects", "Project")  # noqa: N806
    Opportunity = apps.get_model("leads", "Opportunity")  # noqa: N806
    first = dict(
        Opportunity._base_manager.filter(sequence_no=1).values_list("lead_id", "id")
    )
    for project in Project._base_manager.filter(lead__isnull=False).iterator():
        Project._base_manager.filter(pk=project.pk).update(
            opportunity_id=first[project.lead_id]
        )


def backwards(apps, schema_editor):
    Project = apps.get_model("projects", "Project")  # noqa: N806
    for project in Project._base_manager.filter(opportunity__isnull=False).select_related(
        "opportunity"
    ):
        Project._base_manager.filter(pk=project.pk).update(lead_id=project.opportunity.lead_id)


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0003_remove_sanctioned_budget"),
        ("leads", "0005_drop_lead_deal_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="opportunity",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="project",
                to="leads.opportunity",
            ),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(model_name="project", name="lead"),
    ]
