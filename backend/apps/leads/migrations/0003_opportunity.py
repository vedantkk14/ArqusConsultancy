"""Split the deal out of Lead: add Opportunity and the nullable links to it (step 1 of 3)."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("leads", "0002_seed_whatsapp_templates"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Opportunity",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_deleted", models.BooleanField(db_index=True, default=False)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("sequence_no", models.PositiveIntegerField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("NEW", "New"),
                            ("CONTACTED", "Contacted"),
                            ("INTERESTED", "Interested"),
                            ("WON", "Won"),
                            ("LOST", "Lost"),
                        ],
                        default="NEW",
                        max_length=20,
                    ),
                ),
                ("next_followup_at", models.DateTimeField(blank=True, null=True)),
                (
                    "proposed_amount",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
                ),
                ("won_at", models.DateTimeField(blank=True, null=True)),
                (
                    "lost_reason",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("PRICE", "Price"),
                            ("COMPETITOR", "Went with a competitor"),
                            ("NO_RESPONSE", "No response"),
                            ("NOT_INTERESTED", "Not interested"),
                            ("REQUIREMENT_CHANGED", "Requirement changed"),
                            ("OTHER", "Other"),
                        ],
                        max_length=30,
                    ),
                ),
                ("lost_note", models.TextField(blank=True)),
                ("requirements", models.TextField(blank=True)),
                (
                    "assigned_to",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="assigned_opportunities",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_opportunities",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "lead",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="opportunities",
                        to="leads.lead",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "indexes": [
                    models.Index(fields=["lead", "-created_at"], name="opp_lead_time"),
                    models.Index(
                        fields=["status", "assigned_to", "next_followup_at"],
                        name="opp_status_owner_fu",
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("lead", "sequence_no"), name="opp_lead_sequence"
                    )
                ],
            },
        ),
        migrations.AddField(
            model_name="lead",
            name="current_opportunity",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="leads.opportunity",
            ),
        ),
        migrations.AddField(
            model_name="interaction",
            name="opportunity",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="interactions",
                to="leads.opportunity",
            ),
        ),
        migrations.AddField(
            model_name="messagelog",
            name="opportunity",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="messages",
                to="leads.opportunity",
            ),
        ),
    ]
