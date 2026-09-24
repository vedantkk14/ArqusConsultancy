"""Team > Users: permission matrix, self-protection, commission rates, temp passwords, overview."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .conftest import *  # noqa: F401,F403  (autouse cache + fast hasher fixtures)

User = get_user_model()
URL = "/api/v1/users"
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


@pytest.fixture
def exec_():
    return make("eva", "SALES_EXEC", first_name="Eva", commission_rate="2.50")


# ---- Permissions -----------------------------------------------------------------------


def test_anonymous_gets_401():
    assert client().get(URL).status_code == 401


@pytest.mark.parametrize("role", ["SALES_MANAGER", "SALES_EXEC", "PROJECT_MANAGER"])
def test_non_admins_are_refused_everywhere_in_team(role, exec_):
    c = client(make("other", role))
    calls = [
        ("get", URL),
        ("post", URL),
        ("get", f"{URL}/{exec_.id}"),
        ("patch", f"{URL}/{exec_.id}"),
        ("post", f"{URL}/{exec_.id}/deactivate"),
        ("post", f"{URL}/{exec_.id}/reactivate"),
        ("post", f"{URL}/{exec_.id}/reset-password"),
        ("patch", f"{URL}/{exec_.id}/commission-rate"),
        ("get", f"{URL}/roles"),
    ]
    for method, url in calls:
        assert getattr(c, method)(url, {}, format="json").status_code == 403, (method, url)


@pytest.mark.parametrize(
    "role, status",
    [("ADMIN", 200), ("SALES_MANAGER", 200), ("SALES_EXEC", 403), ("PROJECT_MANAGER", 403)],
)
def test_assignments_overview_is_for_admin_and_sales_manager(role, status):
    assert client(make("x", role)).get(f"{URL}/assignments-overview").status_code == status


# ---- List, detail, update --------------------------------------------------------------


def test_list_filters_search_and_paginates(admin, exec_):
    make("pat", "PROJECT_MANAGER", first_name="Pat", is_active=False)
    c = client(admin)
    body = c.get(URL).json()
    assert body["count"] == 3
    assert {"id", "username", "name", "email", "role", "is_active", "commission_rate"} <= set(
        body["results"][0]
    )
    assert [u["username"] for u in c.get(f"{URL}?role=SALES_EXEC").json()["results"]] == ["eva"]
    assert [u["username"] for u in c.get(f"{URL}?is_active=false").json()["results"]] == ["pat"]
    assert [u["username"] for u in c.get(f"{URL}?q=EVA").json()["results"]] == ["eva"]
    assert c.get(f"{URL}?page_size=2").json()["results"].__len__() == 2
    assert c.get(URL + "/").status_code == 200  # trailing slash works too


def test_commission_rate_is_only_shown_for_execs(admin, exec_):
    rows = {u["username"]: u for u in client(admin).get(URL).json()["results"]}
    assert rows["eva"]["commission_rate"] == "2.50"
    assert rows["boss"]["commission_rate"] is None


def test_patch_updates_profile_fields_and_rejects_a_taken_email(admin, exec_):
    c = client(admin)
    r = c.patch(f"{URL}/{exec_.id}", {"first_name": "Evie", "phone": "999"}, format="json")
    assert r.status_code == 200 and r.json()["first_name"] == "Evie"
    r = c.patch(f"{URL}/{exec_.id}", {"email": "BOSS@crm.local"}, format="json")
    assert r.status_code == 400 and "email" in r.json()["error"]["details"]


def test_role_change_but_never_your_own_or_the_last_admin(admin, exec_):
    c = client(admin)
    assert (
        c.patch(f"{URL}/{exec_.id}", {"role": "SALES_MANAGER"}, format="json").json()["role"]
        == "SALES_MANAGER"
    )
    r = c.patch(f"{URL}/{admin.id}", {"role": "SALES_EXEC"}, format="json")
    assert r.status_code == 400 and r.json()["error"]["code"] == "cannot_change_own_role"


# ---- Deactivate / reactivate -----------------------------------------------------------


def test_deactivate_signs_the_user_out_and_reactivate_restores_them(admin, exec_):
    c = client(admin)
    assert c.post(f"{URL}/{exec_.id}/deactivate").json()["is_active"] is False
    login = APIClient().post(
        "/api/v1/auth/login", {"identifier": "eva", "password": "pw"}, format="json"
    )
    assert login.status_code == 403 and login.json()["error"]["code"] == "account_disabled"
    assert c.post(f"{URL}/{exec_.id}/reactivate").json()["is_active"] is True
    ok = APIClient().post(
        "/api/v1/auth/login", {"identifier": "eva", "password": "pw"}, format="json"
    )
    assert ok.status_code == 200


def test_an_admin_cannot_deactivate_themselves(admin):
    r = client(admin).post(f"{URL}/{admin.id}/deactivate")
    assert r.status_code == 400 and r.json()["error"]["code"] == "cannot_self_deactivate"
    admin.refresh_from_db()
    assert admin.is_active is True


def test_the_last_active_admin_cannot_be_deactivated(admin):
    other = make("second", "ADMIN")
    assert client(admin).post(f"{URL}/{other.id}/deactivate").status_code == 200
    # `other` is inactive now; `admin` is the only one left, and cannot remove themselves
    assert (
        client(admin).post(f"{URL}/{admin.id}/deactivate").json()["error"]["code"]
        == "cannot_self_deactivate"
    )
    third = make("third", "ADMIN")
    User.objects.filter(pk=admin.pk).update(is_active=False)
    r = client(third).post(
        f"{URL}/{admin.id}/deactivate"
    )  # admin already inactive: allowed (no-op)
    assert r.status_code == 200
    r = client(make("fourth", "ADMIN")).post(f"{URL}/{third.id}/deactivate")
    assert r.status_code == 200  # fourth + third: two active admins, so one may go


# ---- Reset password --------------------------------------------------------------------


def test_reset_password_returns_a_usable_temporary_password_once(admin, exec_):
    r = client(admin).post(f"{URL}/{exec_.id}/reset-password")
    assert r.status_code == 200
    temp = r.json()["temporary_password"]
    assert len(temp) >= 12 and r.json()["must_change_password"] is True
    exec_.refresh_from_db()
    assert exec_.must_change_password is True and exec_.check_password(temp)
    login = APIClient().post(
        "/api/v1/auth/login", {"identifier": "eva", "password": temp}, format="json"
    )
    assert login.status_code == 200 and login.json()["must_change_password"] is True
    assert (
        "temporary_password" not in client(admin).get(f"{URL}/{exec_.id}").json()
    )  # never readable again
    assert (
        client(admin).post(f"{URL}/{exec_.id}/reset-password").json()["temporary_password"] != temp
    )


# ---- Commission ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rate, ok",
    [
        ("0", True),
        ("12.5", True),
        ("100", True),
        ("100.01", False),
        ("-1", False),
        ("2.555", False),
        ("abc", False),
    ],
)
def test_commission_rate_validation(admin, exec_, rate, ok):
    r = client(admin).patch(
        f"{URL}/{exec_.id}/commission-rate", {"commission_rate": rate}, format="json"
    )
    assert (r.status_code == 200) is ok
    if ok:
        exec_.refresh_from_db()
        assert f"{exec_.commission_rate:.2f}" == f"{float(rate):.2f}"


def test_only_sales_execs_have_a_commission_rate(admin):
    pm = make("pm", "PROJECT_MANAGER")
    r = client(admin).patch(
        f"{URL}/{pm.id}/commission-rate", {"commission_rate": "5"}, format="json"
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "not_a_sales_exec"


def test_create_accepts_a_rate_only_for_execs(admin):
    body = {
        "username": "n1",
        "email": "n1@crm.local",
        "first_name": "N",
        "last_name": "One",
        "role": "SALES_EXEC",
        "password": "Welcome#2026x",
        "commission_rate": "3.25",
    }
    r = client(admin).post(URL, body, format="json")
    assert r.status_code == 201 and r.json()["commission_rate"] == "3.25"
    bad = {**body, "username": "n2", "email": "n2@crm.local", "role": "PROJECT_MANAGER"}
    assert client(admin).post(URL, bad, format="json").status_code == 400


# ---- Roles reference and assignments overview ------------------------------------------


def test_roles_are_a_fixed_read_only_reference(admin):
    rows = client(admin).get(f"{URL}/roles").json()
    assert [r["role"] for r in rows] == ROLES
    assert all(r["description"] and r["can"] for r in rows)
    assert client(admin).post(f"{URL}/roles", {}, format="json").status_code in (403, 404, 405)


def test_assignments_overview_counts_leads_and_falls_back_without_projects(admin, exec_):
    from datetime import timedelta

    from django.utils import timezone

    from apps.leads.models import Lead

    pm = make("paul", "PROJECT_MANAGER", first_name="Paul")
    now = timezone.now()
    Lead.objects.create(
        name="A", phone="+919000000001", assigned_to=exec_, next_followup_at=now - timedelta(days=1)
    )
    Lead.objects.create(
        name="B", phone="+919000000002", assigned_to=exec_, next_followup_at=now + timedelta(days=1)
    )
    Lead.objects.create(
        name="C", phone="+919000000003", assigned_to=exec_, status="WON", proposed_amount=1
    )
    body = client(admin).get(f"{URL}/assignments-overview").json()
    assert body["data_sources"]["leads"] is True
    assert body["execs"] == [{"id": exec_.id, "name": "Eva", "open_leads": 2, "overdue": 1}]
    assert (
        body["data_sources"]["projects"] is False
    )  # projects.Project is not merged: zeros, no error
    assert body["pms"] == [{"id": pm.id, "name": "Paul", "running_projects": 0, "over_budget": 0}]
