"""A returning client: their projects are numbered #1, #2, ... and kept together, and the Running
list also shows their earlier (completed) projects under the current one."""

from django.utils import timezone

from apps.accounts.models import Ledger
from apps.leads.models import LeadStatus
from apps.leads.services import add_opportunity
from apps.projects import selectors, services

from .conftest import BASE


def _next_deal(lead, amount="200000.00"):
    """Deal #2 (#3, ...) with the same client, won and finalized."""
    deal = add_opportunity(
        lead, status=LeadStatus.WON, won_at=timezone.now(), proposed_amount=amount
    )
    Ledger.objects.create(
        opportunity=deal,
        total_amount=amount,
        finalized_at=timezone.now(),
        finalized_on=selectors.business_today(),
    )
    return deal


def _convert(deal, admin, pm=None, name="P"):
    return services.convert(
        deal.pk, name=name, pm_id=pm.pk if pm else None,
        start_date=None, expected_end_date=None, scope="", by=admin,
    )  # fmt: skip


def test_running_lists_a_returning_clients_past_projects_numbered(
    client_for, admin, pm1, make_opportunity
):
    first = make_opportunity(name="Badagu")
    old = _convert(first, admin, pm1, name="Turf 1")
    client_for(admin).post(f"{BASE}/{old.pk}/complete")
    new = _convert(_next_deal(first.lead), admin, pm1, name="Turf 2")
    other = _convert(make_opportunity(name="Solo"), admin, pm1, name="Solo turf")

    rows = client_for(admin).get(f"{BASE}?status=RUNNING&history=1").json()["results"]
    by_id = {r["id"]: r for r in rows}
    assert set(by_id) == {old.pk, new.pk, other.pk}  # the completed #1 comes along
    assert by_id[old.pk]["status"] == "COMPLETED" and by_id[old.pk]["project_no"] == 1
    assert by_id[new.pk]["project_no"] == 2
    assert by_id[other.pk]["project_no"] is None  # one project: no number
    ids = [r["id"] for r in rows]
    assert ids.index(new.pk) + 1 == ids.index(old.pk)  # #1 sits right under #2


def test_history_is_off_without_the_flag_and_under_narrowing_filters(
    client_for, admin, pm1, make_opportunity
):
    first = make_opportunity()
    old = _convert(first, admin, pm1)
    client_for(admin).post(f"{BASE}/{old.pk}/complete")
    _convert(_next_deal(first.lead), admin, pm1)
    c = client_for(admin)
    assert all(r["status"] == "RUNNING" for r in c.get(f"{BASE}?status=RUNNING").json()["results"])
    narrowed = c.get(f"{BASE}?status=RUNNING&history=1&no_pm=1").json()["results"]
    assert all(r["status"] == "RUNNING" for r in narrowed)


def test_a_pm_only_sees_history_of_their_own_projects(
    client_for, admin, pm1, make_user, make_opportunity
):
    other_pm = make_user("PROJECT_MANAGER")
    first = make_opportunity()
    old = _convert(first, admin, other_pm)
    client_for(admin).post(f"{BASE}/{old.pk}/complete")
    _convert(_next_deal(first.lead), admin, pm1)
    rows = client_for(pm1).get(f"{BASE}?status=RUNNING&history=1").json()["results"]
    assert [r["status"] for r in rows] == ["RUNNING"]  # the other PM's project stays hidden


def test_default_order_is_most_recent_client_first(client_for, admin, pm1, make_opportunity):
    a = _convert(make_opportunity(name="A"), admin, pm1, name="A1")
    b = _convert(make_opportunity(name="B"), admin, pm1, name="B1")
    rows = client_for(admin).get(f"{BASE}?status=RUNNING").json()["results"]
    assert [r["id"] for r in rows] == [b.pk, a.pk]
