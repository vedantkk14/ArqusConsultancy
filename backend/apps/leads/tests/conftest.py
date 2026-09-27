from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.leads.models import Lead, LeadStatus

BASE = "/api/v1/leads"


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
            **extra,
        )

    return _make


@pytest.fixture
def admin(make_user):
    return make_user("ADMIN")


@pytest.fixture
def manager(make_user):
    return make_user("SALES_MANAGER")


@pytest.fixture
def exec_a(make_user):
    return make_user("SALES_EXEC")


@pytest.fixture
def exec_b(make_user):
    return make_user("SALES_EXEC")


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
def make_lead(db):
    counter = {"n": 0}

    def _make(**fields):
        counter["n"] += 1
        defaults = {
            "name": f"Lead {counter['n']}",
            "phone": f"+9197{counter['n']:08d}",
            "status": LeadStatus.NEW,
        }
        defaults.update(fields)
        return Lead.objects.create(**defaults)

    return _make


@pytest.fixture
def future():
    return timezone.now() + timedelta(days=2)


def money(value) -> Decimal:
    return Decimal(str(value))
