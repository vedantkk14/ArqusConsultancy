import io
from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.leads.models import Lead, LeadStatus
from apps.projects import integrations, selectors, services

BASE = "/api/v1/projects"
EXPENSES = "/api/v1/expenses"
TOTAL = Decimal("1000000.00")  # the deal total the leak tests look for in PM responses
LEAD_PHONE = "+919812345678"


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"


@pytest.fixture(autouse=True)
def fast_hasher(settings):
    """Password hashing is the slowest part of creating test users; the tests never log in."""
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture
def make_user(db):
    counter = {"n": 0}

    def _make(role, **extra):
        counter["n"] += 1
        return get_user_model().objects.create_user(
            username=f"{role.lower()}{counter['n']}",
            password="pw",
            role=role,
            first_name=role.title().replace("_", " "),
            last_name=str(counter["n"]),
            email=f"{role.lower()}{counter['n']}@crm.local",
            **extra,
        )

    return _make


@pytest.fixture
def admin(make_user):
    return make_user("ADMIN")


@pytest.fixture
def pm1(make_user):
    return make_user("PROJECT_MANAGER")


@pytest.fixture
def pm2(make_user):
    return make_user("PROJECT_MANAGER")


@pytest.fixture
def sales_manager(make_user):
    return make_user("SALES_MANAGER")


@pytest.fixture
def sales_exec(make_user):
    return make_user("SALES_EXEC")


@pytest.fixture
def client_for():
    def _client(user=None):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user)
        return client

    return _client


@pytest.fixture
def make_lead(db, sales_exec):
    counter = {"n": 0}

    def _make(**fields):
        counter["n"] += 1
        defaults = {
            "name": f"Client {counter['n']}",
            "phone": LEAD_PHONE if counter["n"] == 1 else f"+9197{counter['n']:08d}",
            "email": f"client{counter['n']}@example.com",
            "status": LeadStatus.WON,
            "won_at": timezone.now(),
            "proposed_amount": TOTAL,
            "assigned_to": sales_exec,
        }
        defaults.update(fields)
        return Lead.objects.create(**defaults)

    return _make


@pytest.fixture
def make_project(admin, make_lead):
    def _make(pm=None, budget="600000.00", lead=None, **extra):
        lead = lead or make_lead()
        return services.convert(
            lead.pk,
            name=extra.pop("name", f"Turf for {lead.name}"),
            sanctioned_budget=Decimal(budget),
            pm_id=pm.pk if pm else None,
            start_date=None,
            expected_end_date=None,
            scope=extra.pop("scope", "Full turf install"),
            by=admin,
        )

    return _make


@pytest.fixture
def project(make_project, pm1):
    return make_project(pm=pm1)


def png_bytes(size=(64, 48), exif=False) -> bytes:
    image = Image.new("RGB", size, (200, 30, 30))
    out = io.BytesIO()
    if exif:
        data = Image.Exif()
        data[0x010F] = "SecretCamera"  # Make
        data[0x8298] = "Copyright test"
        image.save(out, "JPEG", exif=data)
    else:
        image.save(out, "PNG")
    return out.getvalue()


def receipt_file(name="r.png", data=None, content_type="image/png"):
    return SimpleUploadedFile(name, data or png_bytes(), content_type=content_type)


@pytest.fixture
def make_expense(request):
    def _make(by, amount="1000.00", proj=None, category="MATERIALS", **extra):
        proj = proj or request.getfixturevalue("project")
        data = {
            "amount": Decimal(amount),
            "category": category,
            "spent_on": selectors.business_today(),
            "vendor": extra.pop("vendor", "Vendor"),
            "description": extra.pop("description", "Item"),
            **extra,
        }
        upload = None if category == "LABOUR" else receipt_file()
        return services.add_expense(proj.pk, by, data, upload)

    return _make


@pytest.fixture
def notes(monkeypatch):
    """Every notify() call as (user_id, type, payload)."""
    calls = []
    monkeypatch.setattr(
        integrations, "notify", lambda user, type_, payload: calls.append((user.pk, type_, payload))
    )
    return calls


def expense_form(**over) -> dict:
    form = {
        "amount": "1000.00",
        "category": "MATERIALS",
        "spent_on": selectors.business_today().isoformat(),
        "vendor": "Shree Traders",
        "description": "Sand",
        "receipt": receipt_file(),
    }
    form.update(over)
    return {k: v for k, v in form.items() if v is not None}


def days_ago(n: int):
    return selectors.business_today() - timedelta(days=n)


FORBIDDEN_KEYS = (
    "total_amount",
    "proposed_amount",
    "ledger",
    "payment",
    "received",
    "outstanding",
    "margin",
    "lead",
    "phone",
    "email",
    "commission",
    "final",
)
FORBIDDEN_TEXT = ("1000000", LEAD_PHONE, LEAD_PHONE[3:], "client1@example.com")


def leak_keys(payload, path="$"):
    """Every JSON key (at any depth) that looks like finance or lead data."""
    found = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            if any(bad in str(key).lower() for bad in FORBIDDEN_KEYS):
                found.append(f"{path}.{key}")
            found += leak_keys(value, f"{path}.{key}")
    elif isinstance(payload, list):
        for i, item in enumerate(payload):
            found += leak_keys(item, f"{path}[{i}]")
    return found


def assert_no_leak(response):
    """A PM response must not carry finance or lead data: not as a key, not as text."""
    raw = (
        response.content.decode("utf-8", "ignore")
        if hasattr(response, "content")
        else str(response)
    )
    try:
        data = response.json()
    except Exception:  # noqa: BLE001 - binary or empty body
        data = None
    assert leak_keys(data) == [], (
        f"leaked keys in {response.request['PATH_INFO']}: {leak_keys(data)}"
    )
    for needle in FORBIDDEN_TEXT:
        assert needle not in raw, f"{needle!r} leaked in {response.request['PATH_INFO']}"
