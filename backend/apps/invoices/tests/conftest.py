import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

BASE = "/api/v1/invoices"


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
def client_for():
    def _client(user=None):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user)
        return client

    return _client


def payload(**over):
    body = {
        "invoice_no": "2026-27/200",
        "title": "Cycle track - Harmony Infra",
        "invoice_date": "2026-08-24",
        "client_name": "HARMONY INFRA",
        "client_address": "337-A, Avadh Viceroy, Varachha Road, Surat",
        "client_gstin": "24aaqfh0005a1z6",
        "client_phone": "9812345678",
        "client_email": "accounts@harmony.example",
        "tax_type": "IGST",
        "gst_percent": "18",
        "items": [
            {
                "particulars": "Acrylic cycle track\n1.Primer\n2.Color Coat",
                "hsn": "32091010",
                "quantity": "100",
                "rate": "381.00",
                "unit": "Sq.ft",
            }
        ],
    }
    body.update(over)
    return body
