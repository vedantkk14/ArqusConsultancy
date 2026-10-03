"""Admins and sales managers can reword WhatsApp templates, email templates and call scripts."""

import pytest

from apps.leads.models import CallScript, EmailTemplate, WhatsAppTemplate

from .conftest import BASE

pytestmark = pytest.mark.django_db


def test_manager_edits_a_whatsapp_template_at_any_time(client_for, manager):
    tpl = WhatsAppTemplate.objects.create(name="Hello", body="Hi {{lead_name}}")
    client = client_for(manager)
    for body in ("Hi {{lead_name}}, new wording", "Third version"):
        res = client.patch(f"{BASE}/whatsapp-templates/{tpl.pk}", {"body": body}, format="json")
        assert res.status_code == 200 and res.json()["body"] == body
        tpl.refresh_from_db()
        assert tpl.body == body


def test_admin_edits_email_template_and_call_script(client_for, admin):
    email = EmailTemplate.objects.create(name="Intro", subject="Hello", body="Body")
    script = CallScript.objects.create(name="Opener", body="Say hi")
    client = client_for(admin)
    res = client.patch(
        f"{BASE}/email-templates/{email.pk}", {"subject": "New subject"}, format="json"
    )
    assert res.status_code == 200 and res.json()["subject"] == "New subject"
    res = client.patch(f"{BASE}/call-scripts/{script.pk}", {"name": "Closer"}, format="json")
    assert res.status_code == 200 and res.json()["name"] == "Closer"


def test_sales_exec_cannot_edit_and_blank_or_duplicate_is_rejected(client_for, manager, exec_a):
    first = WhatsAppTemplate.objects.create(name="One", body="a")
    WhatsAppTemplate.objects.create(name="Two", body="b")
    url = f"{BASE}/whatsapp-templates/{first.pk}"
    assert client_for(exec_a).patch(url, {"body": "x"}, format="json").status_code == 403
    assert client_for(manager).patch(url, {"body": "  "}, format="json").status_code == 400
    assert client_for(manager).patch(url, {"name": "Two"}, format="json").status_code == 400
    first.refresh_from_db()
    assert first.body == "a" and first.name == "One"
