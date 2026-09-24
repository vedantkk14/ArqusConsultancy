"""Notifications: own-only scoping, unread counts, read and read-all, pagination, notify()."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.core.services import notify
from apps.notifications.models import Notification

User = get_user_model()
URL = "/api/v1/notifications"
pytestmark = pytest.mark.django_db


def make_user(name, role="SALES_EXEC"):
    return User.objects.create_user(name, f"{name}@crm.local", "pw", role=role)


def client_for(user=None):
    client = APIClient()
    if user:
        client.force_authenticate(user)
    return client


@pytest.fixture
def alice():
    return make_user("alice", "ADMIN")


@pytest.fixture
def bob():
    return make_user("bob")


def test_notify_stores_a_rendered_notification(alice):
    row = notify(
        alice, "lead_won", {"lead_name": "Acme", "proposed_amount": "1250000.00", "won_by": "Eva"}
    )
    assert row.title == "Deal won"
    assert row.body == "Acme was won for \u20b912,50,000 by Eva."
    assert row.is_read is False and row.recipient == alice
    assert row.data["lead_name"] == "Acme"


def test_notify_handles_unknown_types_missing_keys_and_long_values(alice):
    unknown = notify(alice, "something_new", {"message": "Hello"})
    assert unknown.title == "Something new" and unknown.body == "Hello"
    partial = notify(alice, "lead_assigned", {})
    assert partial.body == " was assigned to you."
    long = notify(alice, "lead_assigned", {"lead_name": "x" * 500})
    assert len(long.data["lead_name"]) == 200
    assert notify(None, "lead_won") is None


def test_auth_is_required():
    assert client_for().get(URL).status_code == 401
    assert client_for().get(f"{URL}/unread-count").status_code == 401


def test_a_user_only_sees_and_touches_their_own(alice, bob):
    mine = notify(alice, "lead_assigned", {"lead_name": "A"})
    theirs = notify(bob, "lead_assigned", {"lead_name": "B"})
    c = client_for(alice)
    assert [n["id"] for n in c.get(URL).json()["results"]] == [mine.id]
    assert c.post(f"{URL}/{theirs.id}/read").status_code == 404
    theirs.refresh_from_db()
    assert theirs.is_read is False
    assert c.get(f"{URL}/unread-count").json() == {"count": 1}


def test_unread_count_read_and_read_all(alice, bob):
    rows = [notify(alice, "lead_assigned", {"lead_name": f"L{i}"}) for i in range(4)]
    notify(bob, "lead_assigned", {"lead_name": "other"})
    c = client_for(alice)
    assert c.get(f"{URL}/unread-count").json()["count"] == 4

    r = c.post(f"{URL}/{rows[0].id}/read")
    assert r.status_code == 200 and r.json()["is_read"] is True
    assert c.post(f"{URL}/{rows[0].id}/read").status_code == 200  # idempotent
    assert c.get(f"{URL}/unread-count").json()["count"] == 3

    assert c.post(f"{URL}/read-all").json() == {"updated": 3}
    assert c.get(f"{URL}/unread-count").json()["count"] == 0
    assert client_for(bob).get(f"{URL}/unread-count").json()["count"] == 1  # untouched


def test_filter_by_is_read(alice):
    a = notify(alice, "lead_assigned", {"lead_name": "A"})
    notify(alice, "lead_assigned", {"lead_name": "B"})
    c = client_for(alice)
    c.post(f"{URL}/{a.id}/read")
    assert len(c.get(f"{URL}?is_read=false").json()["results"]) == 1
    assert [n["id"] for n in c.get(f"{URL}?is_read=true").json()["results"]] == [a.id]
    assert len(c.get(URL).json()["results"]) == 2


def test_pagination_newest_first(alice):
    for i in range(25):
        notify(alice, "lead_assigned", {"lead_name": f"L{i}"})
    data = client_for(alice).get(URL).json()
    assert data["count"] == 25 and len(data["results"]) == 20
    assert data["results"][0]["data"]["lead_name"] == "L24"
    assert len(client_for(alice).get(f"{URL}?page=2").json()["results"]) == 5
    assert len(client_for(alice).get(f"{URL}?page_size=500").json()["results"]) == 25


def test_paths_work_with_and_without_a_trailing_slash(alice):
    notify(alice, "lead_assigned", {"lead_name": "A"})
    c = client_for(alice)
    assert c.get(URL).status_code == 200 and c.get(URL + "/").status_code == 200
    assert c.get(f"{URL}/unread-count/").status_code == 200


def test_device_registration_is_a_clear_501(alice):
    r = client_for(alice).post(f"{URL}/devices", {"token": "t", "platform": "ios"}, format="json")
    assert r.status_code == 501
    assert r.json()["error"]["code"] == "not_implemented"
    assert "mobile app" in r.json()["error"]["message"]


def test_list_query_budget(alice, django_assert_max_num_queries):
    for i in range(20):
        notify(alice, "lead_assigned", {"lead_name": f"L{i}"})
    with django_assert_max_num_queries(4):
        assert client_for(alice).get(URL).status_code == 200
    assert Notification.objects.count() == 20
