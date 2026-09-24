from django.db import migrations

TEMPLATES = [
    (
        "Welcome / Intro",
        "Hi {{lead_name}}, this is {{exec_name}} from {{company}}. Thanks for your interest! "
        "When would be a good time to talk about your requirements?",
    ),
    (
        "Follow-up",
        "Hi {{lead_name}}, {{exec_name}} from {{company}} here. Just following up on our last "
        "conversation. Do you have any questions I can help with?",
    ),
    (
        "Proposal reminder",
        "Hi {{lead_name}}, a quick reminder about the proposal we shared from {{company}}. "
        "Happy to walk you through it. Regards, {{exec_name}}",
    ),
]


def seed(apps, schema_editor):
    template = apps.get_model("leads", "WhatsAppTemplate")
    for name, body in TEMPLATES:
        template.objects.get_or_create(name=name, defaults={"body": body, "is_active": True})


def unseed(apps, schema_editor):
    apps.get_model("leads", "WhatsAppTemplate").objects.filter(
        name__in=[name for name, _ in TEMPLATES]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("leads", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
