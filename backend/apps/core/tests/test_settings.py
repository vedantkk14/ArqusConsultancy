"""Settings: master data, audit log (signals, filters, permissions), profile."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.core import master_data, signals
from apps.core.models import AuditLog
from apps.leads.models import Lead
from apps.users.tests.conftest import *  # noqa: F401,F403

User = get_user_model()
pytestmark = pytest.mark.django_db
ROLES = ["ADMIN", "SALES_MANAGER", "SALES_EXEC", "PROJECT_MANAGER"]


def make(name, role="SALES_EXEC", **extra):
    return User.objects.create_user(name, f"{name}@crm.local", "pw", role=role, **extra)


def client(user=None):
    c = APIClient()
    if user:
        c.force_authenticate(user)
    return c


@pytest.fixture
def admin():
    return make("boss", "ADMIN")


def new_lead(**kw):
    return Lead.objects.create(name="Acme", phone="+919876543210", **kw)


@pytest.mark.parametrize("role,code", [(r, 200 if r == "ADMIN" else 403) for r in ROLES])
def test_permission_matrix(role, code):
    user = make("u_" + role.lower(), role)
    for url in ("/api/v1/core/master-data", "/api/v1/core/audit-log"):
        assert client(user).get(url).status_code == code
    assert client().get("/api/v1/core/audit-log").status_code == 401


def test_master_data_matches_enums_and_degrades(admin):
    lists = {x["key"]: x for x in client(admin).get("/api/v1/core/master-data").json()["lists"]}
    field = Lead._meta.get_field("source")
    assert [v["value"] for v in lists["lead_sources"]["values"]] == [c[0] for c in field.choices]
    assert lists["lead_sources"]["available"] is True
    for entry in lists.values():
        assert set(entry) >= {"key", "label", "source", "owner_app", "available", "values"}


def test_master_data_missing_model_is_empty(monkeypatch):
    monkeypatch.setattr(
        master_data,
        "MANIFEST",
        [{"key": "x", "label": "X", "app": "nope", "model": "M", "field": "f"}],
    )
    (only,) = master_data.build_master_data()
    assert only["available"] is False and only["values"] == []


def test_lead_save_writes_one_row_with_diff(admin):
    lead = new_lead()
    assert AuditLog.objects.filter(model_label="leads.Lead", action="CREATE").count() == 1
    AuditLog.objects.all().delete()
    lead.name = "Acme Corp"
    lead.save()
    (row,) = AuditLog.objects.all()
    assert row.action == "UPDATE" and row.object_id == str(lead.pk)
    assert row.changes == {"name": {"old": "Acme", "new": "Acme Corp"}}


def test_unchanged_save_writes_nothing():
    lead = new_lead()
    AuditLog.objects.all().delete()
    lead.save()
    assert AuditLog.objects.count() == 0


def test_long_values_truncated():
    lead = new_lead()
    AuditLog.objects.all().delete()
    lead.email = "a@b.co"
    lead.save()
    lead.source_other = "x" * 100
    lead.name = "n" * 149
    lead.save()
    assert all(len(str(v["new"])) <= 200 for v in AuditLog.objects.first().changes.values())


def test_password_never_recorded():
    user = make("pw_user")
    user.set_password("brand-new-secret")
    user.first_name = "Pat"
    user.save()
    blob = " ".join(str(r.changes) for r in AuditLog.objects.filter(model_label="users.User"))
    assert "password" not in blob and "brand-new-secret" not in blob and "pbkdf2" not in blob
    assert "Pat" in blob


def test_missing_model_degrades_silently():
    assert signals.register(["nope.Nothing", "bad-label"]) == []


def test_audit_log_itself_not_audited():
    new_lead()
    assert not AuditLog.objects.filter(model_label="core.AuditLog").exists()


def test_actor_captured_from_request(admin):
    lead = new_lead()
    c = APIClient()
    from rest_framework_simplejwt.tokens import AccessToken

    c.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(admin)}")
    AuditLog.objects.all().delete()
    res = c.patch("/api/v1/me", {"phone": "9999999999"}, format="json")
    assert res.status_code == 200
    row = AuditLog.objects.get(model_label="users.User", object_id=str(admin.pk))
    assert row.actor_id == admin.pk
    del lead


def test_filters_and_pagination(admin):
    other = make("zed", "SALES_MANAGER")
    for i in range(23):
        new_lead().name = f"L{i}"
    AuditLog.objects.filter(model_label="leads.Lead").update(actor=admin)
    a = AuditLog.objects.filter(model_label="users.User").first()
    a.actor = other
    a.save()
    c = client(admin)
    page = c.get("/api/v1/core/audit-log").json()
    assert len(page["results"]) == 20 and page["count"] >= 23
    only = c.get("/api/v1/core/audit-log", {"model_label": "leads.Lead", "actor": admin.pk}).json()
    assert only["count"] == 23
    assert c.get("/api/v1/core/audit-log", {"action": "delete"}).json()["count"] == 0
    assert c.get("/api/v1/core/audit-log", {"q": "zed"}).json()["count"] >= 1
    assert c.get("/api/v1/core/audit-log", {"from": "2999-01-01"}).json()["count"] == 0
    assert c.get("/api/v1/core/audit-log", {"to": "2999-01-01"}).json()["count"] >= 23
    assert "leads.Lead" in c.get("/api/v1/core/audit-log/models").json()


def test_profile_get_and_patch():
    exec_ = make("eva", "SALES_EXEC", first_name="Eva", commission_rate="2.50")
    c = client(exec_)
    me = c.get("/api/v1/me").json()
    assert me["commission_rate"] == "2.50" and me["phone"] == ""
    res = c.patch(
        "/api/v1/me",
        {
            "first_name": " Evie ",
            "phone": "+91 99",
            "email": "x@y.co",
            "role": "ADMIN",
            "commission_rate": "9",
        },
        format="json",
    ).json()
    exec_.refresh_from_db()
    assert exec_.first_name == "Evie" and exec_.phone == "+91 99"
    assert exec_.email == "eva@crm.local" and exec_.role == "SALES_EXEC"
    assert str(exec_.commission_rate) == "2.50" and res["name"]


def test_profile_hides_commission_for_non_exec(admin):
    assert client(admin).get("/api/v1/me").json()["commission_rate"] is None
