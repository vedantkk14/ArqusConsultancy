# ruff: noqa: E501
import io
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts import selectors, services
from apps.leads.models import Lead, LeadStatus

LEDGERS = "/api/v1/ledgers"
PAYMENTS = "/api/v1/payments"
TOTAL = Decimal("100000.00")
LEAD_PHONE = "+919812345678"
BUDGET = "60000.00"  # sanctioned budget the statement must never show


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"


@pytest.fixture(autouse=True)
def fast_hasher(settings):
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
def admin2(make_user):
    return make_user("ADMIN")


@pytest.fixture
def sales_exec(make_user):
    return make_user("SALES_EXEC")


@pytest.fixture
def sales_manager(make_user):
    return make_user("SALES_MANAGER")


@pytest.fixture
def pm(make_user):
    return make_user("PROJECT_MANAGER")


@pytest.fixture
def client_for():
    def _client(user=None):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user)
        return client

    return _client


@pytest.fixture
def notes(monkeypatch):
    """Every notify() call as (user_id, type, payload)."""
    calls = []
    monkeypatch.setattr(
        services, "notify", lambda user, type_, payload: calls.append((user.pk, type_, payload))
    )
    return calls


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
def make_ledger(admin, make_lead):
    """A ledger; finalized at `total` unless finalize=False."""

    def _make(total="100000.00", finalize=True, lead=None, days_ago=0):
        lead = lead or make_lead()
        ledger = services.create_ledger(lead)
        if finalize:
            services.finalize_ledger(lead, Decimal(total), admin)
            ledger.refresh_from_db()
            if days_ago:  # backdate the finalization
                moment = timezone.now() - timedelta(days=days_ago)
                type(ledger).objects.filter(pk=ledger.pk).update(
                    finalized_at=moment, finalized_on=selectors.business_date(moment)
                )
                ledger.refresh_from_db()
        return ledger

    return _make


@pytest.fixture
def ledger(make_ledger):
    return make_ledger()


@pytest.fixture
def make_payment(admin):
    def _make(
        ledger,
        amount="1000.00",
        mode="BANK_TRANSFER",
        reference=None,
        days_ago=0,
        by=None,
        proof=None,
        **extra,
    ):
        received_on = selectors.business_today() - timedelta(days=days_ago)
        if reference is None:
            reference = "" if mode == "CASH" else f"UTR{next_reference()}"
        data = {
            "amount": Decimal(amount),
            "mode": mode,
            "reference": reference,
            "received_on": received_on,
            **extra,
        }
        return services.add_payment(ledger.pk, by or admin, data, proof)

    return _make


_counter = {"n": 0}


def next_reference() -> int:
    _counter["n"] += 1
    return _counter["n"]


def png_bytes(size=(64, 48), exif=False) -> bytes:
    image = Image.new("RGB", size, (30, 120, 200))
    out = io.BytesIO()
    if exif:
        data = Image.Exif()
        data[0x010F] = "SecretCamera"
        image.save(out, "JPEG", exif=data)
    else:
        image.save(out, "PNG")
    return out.getvalue()


def proof_file(name="p.png", data=None, content_type="image/png"):
    return SimpleUploadedFile(name, data or png_bytes(), content_type=content_type)


def payment_form(**over) -> dict:
    form = {
        "amount": "1000.00",
        "mode": "BANK_TRANSFER",
        "reference": "UTR123456",
        "received_on": selectors.business_today().isoformat(),
        "note": "Advance",
    }
    form.update(over)
    return {k: v for k, v in form.items() if v is not None}


@pytest.fixture
def clock(monkeypatch):
    """Move the module clock: clock.set(datetime) or clock.days(n) (n days after now)."""

    class Clock:
        moment = None

        def set(self, moment: datetime):
            self.moment = moment

        def days(self, n: int):
            self.moment = timezone.now() + timedelta(days=n)

    c = Clock()
    monkeypatch.setattr(selectors, "now", lambda: c.moment or timezone.now())
    return c
