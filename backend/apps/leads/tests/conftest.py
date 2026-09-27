from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.leads.models import Lead, LeadStatus, Opportunity
from apps.leads.selectors import with_current_opportunity
from apps.leads.services import add_opportunity

BASE = "/api/v1/leads"
#: make_lead() arguments that belong to the deal (Opportunity), not the client record.
DEAL_FIELDS = {
    "status",
    "next_followup_at",
    "proposed_amount",
    "won_at",
    "lost_reason",
    "lost_note",
}


def fresh(lead) -> Lead:
    """The lead re-read with its current deal's fields (status, follow-up, ...) annotated."""
    return with_current_opportunity(Lead.all_objects.all()).get(pk=lead.pk)


def deal_of(lead) -> Opportunity:
    """The lead's current deal."""
    return Opportunity.all_objects.get(pk=Lead.all_objects.get(pk=lead.pk).current_opportunity_id)


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
        deal = {k: defaults.pop(k) for k in list(defaults) if k in DEAL_FIELDS}
        lead = Lead.objects.create(**defaults)
        add_opportunity(lead, **deal)  # every lead starts with Deal #1, like create_lead()
        return fresh(lead)

    return _make


@pytest.fixture
def make_opportunity(db):
    """Another deal for an existing lead (becomes its current deal)."""

    def _make(lead, **fields):
        fields.setdefault("status", LeadStatus.NEW)
        return add_opportunity(Lead.all_objects.get(pk=lead.pk), **fields)

    return _make


@pytest.fixture
def future():
    return timezone.now() + timedelta(days=2)


def money(value) -> Decimal:
    return Decimal(str(value))
