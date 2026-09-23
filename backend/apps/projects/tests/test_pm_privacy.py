"""Privacy-shield leak tests (owner: Dev B).

Rule: a PROJECT_MANAGER never sees the Total Project Amount, lead data or payments.
They see only the Sanctioned Budget on their own projects.
See docs/ARCHITECTURE.md ("Privacy shield").
"""
import pytest

pytestmark = pytest.mark.skip(reason="Placeholder: implement when projects endpoints exist (Dev B)")


def test_pm_project_detail_has_no_total_amount():
    """GET /projects/<id> as PM: no `total_amount` key anywhere in the JSON (recursive check)."""


def test_pm_project_list_has_no_total_amount():
    """GET /projects as PM: no `total_amount` in any item of the paginated results."""


def test_pm_project_has_no_lead_data():
    """PM response must not contain lead / customer commercial fields (`lead`, deal value...)."""


def test_pm_cannot_access_payments_or_ledger():
    """PM gets 403 on every /accounts/* endpoint, including payments and ledgers."""


def test_pm_only_sees_own_projects():
    """PM queryset is limited to projects assigned to them; others return 404."""


def test_pm_schema_and_error_bodies_do_not_leak_total():
    """Serializer fields, validation errors and OpenAPI examples for PM never show total_amount."""
