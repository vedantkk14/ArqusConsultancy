"""Every existing lead becomes Opportunity #1 with its deal fields; its timeline moves with it
(step 2 of 3). Soft-deleted leads are included so nothing is orphaned."""

from django.db import migrations

DEAL_FIELDS = (
    "status",
    "next_followup_at",
    "proposed_amount",
    "won_at",
    "lost_reason",
    "lost_note",
    "assigned_to_id",
    "created_by_id",
    "is_deleted",
    "deleted_at",
)


def forwards(apps, schema_editor):
    Lead = apps.get_model("leads", "Lead")  # noqa: N806
    Opportunity = apps.get_model("leads", "Opportunity")  # noqa: N806
    Interaction = apps.get_model("leads", "Interaction")  # noqa: N806
    MessageLog = apps.get_model("leads", "MessageLog")  # noqa: N806

    for lead in Lead._base_manager.order_by("id").iterator():
        opp = Opportunity._base_manager.filter(lead_id=lead.pk, sequence_no=1).first()
        if opp is None:
            opp = Opportunity._base_manager.create(
                lead_id=lead.pk,
                sequence_no=1,
                **{field: getattr(lead, field) for field in DEAL_FIELDS},
            )
        # auto_now_add/auto_now overwrite on create: carry the lead's own timestamps over.
        Opportunity._base_manager.filter(pk=opp.pk).update(
            created_at=lead.created_at, updated_at=lead.updated_at
        )
        Lead._base_manager.filter(pk=lead.pk).update(current_opportunity_id=opp.pk)
        Interaction._base_manager.filter(lead_id=lead.pk).update(opportunity_id=opp.pk)
        MessageLog._base_manager.filter(lead_id=lead.pk).update(opportunity_id=opp.pk)


def backwards(apps, schema_editor):
    Lead = apps.get_model("leads", "Lead")  # noqa: N806
    Opportunity = apps.get_model("leads", "Opportunity")  # noqa: N806
    Interaction = apps.get_model("leads", "Interaction")  # noqa: N806
    MessageLog = apps.get_model("leads", "MessageLog")  # noqa: N806

    for opp in Opportunity._base_manager.filter(sequence_no=1).iterator():
        Lead._base_manager.filter(pk=opp.lead_id).update(
            **{f: getattr(opp, f) for f in DEAL_FIELDS if f not in ("is_deleted", "deleted_at")}
        )
    for model in (Interaction, MessageLog):
        for row in model._base_manager.select_related("opportunity").iterator():
            model._base_manager.filter(pk=row.pk).update(lead_id=row.opportunity.lead_id)
    Lead._base_manager.update(current_opportunity_id=None)
    Opportunity._base_manager.all().delete()


class Migration(migrations.Migration):
    dependencies = [("leads", "0003_opportunity")]

    operations = [migrations.RunPython(forwards, backwards)]
