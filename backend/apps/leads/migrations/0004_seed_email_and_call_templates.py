from django.db import migrations

EMAIL_TEMPLATES = [
    (
        "Welcome / Intro",
        "Thanks for your interest, {{lead_name}}!",
        "Hi {{lead_name}},\n\nThis is {{exec_name}} from {{company}}. Thanks for your interest! "
        "When would be a good time to talk about your requirements?\n\nRegards,\n{{exec_name}}",
    ),
    (
        "Follow-up",
        "Following up, {{lead_name}}",
        "Hi {{lead_name}},\n\n{{exec_name}} from {{company}} here. Just following up on our last "
        "conversation. Do you have any questions I can help with?\n\nRegards,\n{{exec_name}}",
    ),
    (
        "Proposal reminder",
        "A quick reminder about our proposal",
        "Hi {{lead_name}},\n\nA quick reminder about the proposal we shared from {{company}}. "
        "Happy to walk you through it.\n\nRegards,\n{{exec_name}}",
    ),
]

CALL_SCRIPTS = [
    (
        "Intro call",
        "Introduce yourself as {{exec_name}} from {{company}}. Thank {{lead_name}} for their "
        "interest, confirm their requirements, and agree on a next step.",
    ),
    (
        "Follow-up call",
        "Reference the last conversation with {{lead_name}}. Ask if they have questions and "
        "whether they need more time to decide.",
    ),
    (
        "Objection handling",
        "Listen to {{lead_name}}'s concern, acknowledge it, and address it with a concrete "
        "example of {{company}}'s work. Close with a clear next step.",
    ),
]


def seed(apps, schema_editor):
    EmailTemplate = apps.get_model("leads", "EmailTemplate")
    for name, subject, body in EMAIL_TEMPLATES:
        EmailTemplate.objects.get_or_create(
            name=name, defaults={"subject": subject, "body": body, "is_active": True}
        )
    CallScript = apps.get_model("leads", "CallScript")
    for name, body in CALL_SCRIPTS:
        CallScript.objects.get_or_create(name=name, defaults={"body": body, "is_active": True})


def unseed(apps, schema_editor):
    apps.get_model("leads", "EmailTemplate").objects.filter(
        name__in=[name for name, _, _ in EMAIL_TEMPLATES]
    ).delete()
    apps.get_model("leads", "CallScript").objects.filter(
        name__in=[name for name, _ in CALL_SCRIPTS]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("leads", "0003_callscript_emailtemplate_messagelog_subject_and_more")]

    operations = [migrations.RunPython(seed, unseed)]
