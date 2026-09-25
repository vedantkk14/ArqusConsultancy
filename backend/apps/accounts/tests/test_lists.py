# ruff: noqa: E501
import csv
import io
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts import selectors, services
from apps.accounts.models import Ledger, Payment

from .conftest import LEDGERS, PAYMENTS


@pytest.fixture
def book(admin, make_lead, make_ledger, make_payment):
    """Awaiting, unpaid, partial (recent), partial (overdue), paid; totals of 100,000 each."""

    def ledger(name, **kw):
        return make_ledger(lead=make_lead(name=name), **kw)

    awaiting = ledger("Aa awaiting", finalize=False)
    unpaid = ledger("Bb unpaid", days_ago=5)
    partial = ledger("Cc partial", days_ago=20)
    make_payment(partial, "40000.00", days_ago=3)
    stale = ledger("Dd stale", days_ago=80)
    make_payment(stale, "25000.00", mode="CASH", days_ago=75)
    paid = ledger("Ee paid", days_ago=50)
    make_payment(paid, "100000.00", mode="UPI", days_ago=10)
    return {
        "awaiting": awaiting,
        "unpaid": unpaid,
        "partial": partial,
        "stale": stale,
        "paid": paid,
    }


def clients(res):
    return [r["client"] for r in res.json()["results"]]


def test_state_filter_and_row_shape(client_for, admin, book):
    c = client_for(admin)
    assert clients(c.get(f"{LEDGERS}?ordering=client")) == [
        "Aa awaiting",
        "Bb unpaid",
        "Cc partial",
        "Dd stale",
        "Ee paid",
    ]
    assert clients(c.get(f"{LEDGERS}?state=PARTIAL&ordering=client")) == ["Cc partial", "Dd stale"]
    assert clients(c.get(f"{LEDGERS}?state=PAID")) == ["Ee paid"]
    assert clients(c.get(f"{LEDGERS}?state=UNPAID")) == ["Bb unpaid"]
    assert clients(c.get(f"{LEDGERS}?state=AWAITING_FINALIZATION")) == ["Aa awaiting"]
    assert clients(c.get(f"{LEDGERS}?state=UNPAID,PAID&ordering=client")) == [
        "Bb unpaid",
        "Ee paid",
    ]
    row = next(r for r in c.get(f"{LEDGERS}?state=PARTIAL&ordering=client").json()["results"])
    assert set(row) == {
        "id", "lead", "client", "phone", "exec_name", "state", "state_label", "finalized", "is_overdue",
        "total", "received", "outstanding", "collected_pct", "days_since", "last_payment_on", "created_at",
    }  # fmt: skip
    assert (
        row["received"] == "40000.00"
        and row["outstanding"] == "60000.00"
        and row["collected_pct"] == "40.0"
    )


def test_other_filters(client_for, admin, book):
    c = client_for(admin)
    assert clients(c.get(f"{LEDGERS}?overdue=true")) == ["Dd stale"]
    assert clients(c.get(f"{LEDGERS}?finalized=false")) == ["Aa awaiting"]
    assert len(clients(c.get(f"{LEDGERS}?finalized=true"))) == 4
    assert clients(c.get(f"{LEDGERS}?has_balance=true&ordering=client")) == [
        "Bb unpaid",
        "Cc partial",
        "Dd stale",
    ]
    assert clients(c.get(f"{LEDGERS}?q=stale")) == ["Dd stale"]
    phone = Ledger.objects.get(pk=book["paid"].pk).lead.phone
    assert clients(c.get(f"{LEDGERS}?q={phone[-6:]}")) == ["Ee paid"]
    assert clients(c.get(f"{LEDGERS}?aging=61-90")) == ["Dd stale"]
    assert c.get(f"{LEDGERS}?state=BOGUS").json()["count"] == 5  # ignored
    assert c.get(f"{LEDGERS}?created_from=2999-01-01").json()["count"] == 0


def test_orderings(client_for, admin, book):
    c = client_for(admin)
    assert (
        clients(c.get(f"{LEDGERS}?has_balance=true&ordering=-outstanding"))[0] == "Bb unpaid"
    )  # 100,000 outstanding
    assert clients(c.get(f"{LEDGERS}?has_balance=true&ordering=-days_since"))[0] == "Dd stale"
    assert clients(c.get(f"{LEDGERS}?ordering=client"))[0] == "Aa awaiting"
    for ordering in (
        "-total",
        "total",
        "-received",
        "-last_payment_on",
        "-created_at",
        "created_at",
        "bogus",
    ):
        assert c.get(f"{LEDGERS}?ordering={ordering}").status_code == 200


def test_pagination_is_twenty_per_page(client_for, admin, make_ledger, make_lead):
    for i in range(23):
        make_ledger(lead=make_lead(name=f"L{i:02d}"), total="1000")
    body = client_for(admin).get(LEDGERS).json()
    assert body["count"] == 23 and len(body["results"]) == 20 and body["next"]


def test_summary_matches_the_list_sums(client_for, admin, book):
    c = client_for(admin)
    summary = c.get(f"{LEDGERS}/summary").json()
    rows = c.get(f"{LEDGERS}?finalized=true").json()["results"]
    assert summary["total_value"] == f"{sum(Decimal(r['total']) for r in rows):.2f}" == "400000.00"
    assert summary["received"] == f"{sum(Decimal(r['received']) for r in rows):.2f}" == "165000.00"
    assert (
        summary["outstanding"]
        == f"{sum(Decimal(r['outstanding']) for r in rows):.2f}"
        == "235000.00"
    )
    assert summary["collection_rate_pct"] == "41.2"
    assert summary["counts"] == {"AWAITING_FINALIZATION": 1, "UNPAID": 1, "PARTIAL": 2, "PAID": 1}
    assert summary["awaiting_finalization"] == 1 and summary["clients_with_balance"] == 3
    assert summary["overdue_clients"] == 1 and summary["overdue_amount"] == "75000.00"
    assert [b["bucket"] for b in summary["aging"]] == ["0-30", "31-60", "61-90", "90+"]
    assert {b["bucket"]: (b["count"], b["amount"]) for b in summary["aging"]}["61-90"] == (
        1,
        "75000.00",
    )
    assert summary["top_overdue"][0]["client"] == "Dd stale"


def test_the_awaiting_ledger_is_not_counted_in_money(client_for, admin, make_ledger):
    make_ledger(finalize=False, total="500000")
    s = client_for(admin).get(f"{LEDGERS}/summary").json()
    assert (
        s["total_value"] == "0.00"
        and s["outstanding"] == "0.00"
        and s["awaiting_finalization"] == 1
    )


def test_options_lists_finalized_ledgers_with_a_balance(client_for, admin, book):
    c = client_for(admin)
    names = [o["client"] for o in c.get(f"{LEDGERS}/options").json()]
    assert names == ["Bb unpaid", "Cc partial", "Dd stale"]
    assert [o["client"] for o in c.get(f"{LEDGERS}/options?q=stale").json()] == ["Dd stale"]
    assert c.get(f"{LEDGERS}/options").json()[1] == {
        "id": book["partial"].pk, "client": "Cc partial", "phone": book["partial"].lead.phone,
        "total": "100000.00", "outstanding": "60000.00",
    }  # fmt: skip


def test_options_is_capped_at_ten(client_for, admin, make_ledger, make_lead):
    for i in range(12):
        make_ledger(lead=make_lead(name=f"O{i:02d}"))
    assert len(client_for(admin).get(f"{LEDGERS}/options").json()) == 10


def test_ledger_detail_shape_and_actions(client_for, admin, book):
    c = client_for(admin)
    detail = c.get(f"{LEDGERS}/{book['partial'].pk}").json()
    assert detail["allowed_actions"] == ["record_payment", "reminder", "revise_total", "statement"]
    assert detail["lead_block"]["name"] == "Cc partial" and detail["project"] is None
    assert c.get(f"{LEDGERS}/{book['awaiting'].pk}").json()["allowed_actions"] == ["finalize"]
    assert c.get(f"{LEDGERS}/{book['paid'].pk}").json()["allowed_actions"] == [
        "revise_total",
        "statement",
    ]
    assert c.get(f"{LEDGERS}/999999").status_code == 404


def test_project_block_uses_the_real_projects_numbers(client_for, admin, ledger, make_payment):
    from apps.projects.models import Expense, Project

    project = Project.objects.create(
        name="Turf", client_name="C", lead=ledger.lead, sanctioned_budget=Decimal("60000.00")
    )
    Expense.objects.create(
        project=project,
        amount=Decimal("15000.00"),
        category="LABOUR",
        spent_on=selectors.business_today(),
    )
    make_payment(ledger, "40000.00")
    block = client_for(admin).get(f"{LEDGERS}/{ledger.pk}").json()["project"]
    assert block == {
        "id": project.pk, "name": "Turf", "status": "RUNNING", "sanctioned_budget": "60000.00", "spent": "15000.00",
        "planned_margin": "40000.00", "live_margin": "25000.00",
    }  # fmt: skip


def test_events_are_paginated_newest_first(client_for, admin, ledger, make_payment):
    make_payment(ledger, "100.00")
    body = client_for(admin).get(f"{LEDGERS}/{ledger.pk}/events").json()
    assert [e["type"] for e in body["results"]] == ["PAYMENT_ADDED", "FINALIZED", "CREATED"]
    assert body["results"][0]["actor_name"] and body["results"][0]["data"]["amount"] == "100.00"


# ---- Payments list, summary, reminder --------------------------------------------------------------


def test_payment_filters_and_summary(client_for, admin, book, make_payment):
    void = make_payment(book["unpaid"], "1000.00", mode="CARD", days_ago=2)
    services.void_payment(void.pk, admin, "typo")
    make_payment(book["unpaid"], "2000.00", mode="OTHER", days_ago=1, proof=None)
    c = client_for(admin)
    assert c.get(PAYMENTS).json()["count"] == 5
    assert c.get(f"{PAYMENTS}?mode=UPI").json()["count"] == 1
    assert c.get(f"{PAYMENTS}?mode=UPI,CASH").json()["count"] == 2
    assert c.get(f"{PAYMENTS}?state=void").json()["count"] == 1
    assert c.get(f"{PAYMENTS}?state=active").json()["count"] == 4
    assert c.get(f"{PAYMENTS}?ledger={book['paid'].pk}").json()["count"] == 1
    assert c.get(f"{PAYMENTS}?q=Cc partial").json()["count"] == 1
    assert c.get(f"{PAYMENTS}?has_proof=true").json()["count"] == 0
    assert c.get(f"{PAYMENTS}?has_proof=false").json()["count"] == 5
    today = selectors.business_today()
    assert c.get(f"{PAYMENTS}?date_from={today}").json()["count"] == 0
    assert c.get(f"{PAYMENTS}?date_to={today - timedelta(days=70)}").json()["count"] == 1
    assert [p["amount"] for p in c.get(f"{PAYMENTS}?ordering=-amount").json()["results"]][
        0
    ] == "100000.00"
    s = c.get(f"{PAYMENTS}/summary").json()
    assert s["total"] == "167000.00" and s["count"] == 4 and s["void_count"] == 1
    assert {m["mode"]: m["total"] for m in s["by_mode"]}["UPI"] == "100000.00"
    assert c.get(f"{PAYMENTS}/summary?mode=CASH").json()["total"] == "25000.00"


def test_reminder_renders_text_and_a_wa_me_link_and_logs_an_event(
    client_for, admin, ledger, make_payment
):
    make_payment(ledger, "40000.00")
    res = client_for(admin).post(f"{LEDGERS}/{ledger.pk}/reminder")
    assert res.status_code == 200
    body = res.json()
    assert "₹60,000.00" in body["text"] and ledger.lead.name in body["text"]
    digits = ledger.lead.phone.lstrip("+")
    assert (
        body["url"].startswith(f"https://wa.me/{digits}?text=")
        and "%E2%82%B960%2C000.00" in body["url"]
    )
    events = client_for(admin).get(f"{LEDGERS}/{ledger.pk}/events").json()["results"]
    assert events[0]["type"] == "REMINDER_SENT"


def test_reminder_with_an_unusable_phone_is_invalid_phone(
    client_for, admin, make_ledger, make_lead
):
    ledger = make_ledger(lead=make_lead(phone="12"))
    res = client_for(admin).post(f"{LEDGERS}/{ledger.pk}/reminder")
    assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_phone"


def test_reminder_needs_an_outstanding_balance(client_for, admin, make_ledger, make_payment):
    unfinalized = make_ledger(finalize=False)
    assert client_for(admin).post(f"{LEDGERS}/{unfinalized.pk}/reminder").status_code == 400
    paid = make_ledger()
    make_payment(paid, "100000.00")
    assert client_for(admin).post(f"{LEDGERS}/{paid.pk}/reminder").status_code == 400


# ---- CSV -------------------------------------------------------------------------------------------


def read_csv(res):
    return list(csv.reader(io.StringIO(b"".join(res.streaming_content).decode("utf-8-sig"))))


def test_ledger_csv_export(client_for, admin, book):
    res = client_for(admin).get(f"{LEDGERS}/export?state=PARTIAL&ordering=client")
    assert (
        res.status_code == 200
        and res["Content-Type"].startswith("text/csv")
        and "ledgers.csv" in res["Content-Disposition"]
    )
    rows = read_csv(res)
    assert rows[0][:4] == ["Client", "Phone", "Executive", "State"] and [
        r[0] for r in rows[1:]
    ] == ["Cc partial", "Dd stale"]
    assert rows[1][6] == "60000.00" and rows[2][-1] == "Yes"


def test_csv_neutralises_formulas_and_is_capped(
    client_for, admin, make_ledger, make_lead, make_payment, monkeypatch
):
    lead = make_lead(name='=HYPERLINK("http://evil")')
    ledger = make_ledger(lead=lead)
    make_payment(ledger, "5.00", reference="+cmd|calc", note="-2+3")
    ledger_cells = [c for row in read_csv(client_for(admin).get(f"{LEDGERS}/export")) for c in row]
    pay_cells = [c for row in read_csv(client_for(admin).get(f"{PAYMENTS}/export")) for c in row]
    for cell in ledger_cells + pay_cells:
        assert cell[:1] not in ("=", "+", "-", "@", "\t", "\r"), cell
    assert (
        '\'=HYPERLINK("http://evil")' in ledger_cells
        and "'+cmd|calc" in pay_cells
        and "'-2+3" in pay_cells
    )
    from apps.accounts import rules

    monkeypatch.setattr(rules, "EXPORT_MAX_ROWS", 2)
    for i in range(4):
        make_ledger(lead=make_lead(name=f"Cap{i}"))
    assert len(read_csv(client_for(admin).get(f"{LEDGERS}/export"))) == 3  # header + 2


def test_payment_csv_export(client_for, admin, book):
    rows = read_csv(client_for(admin).get(f"{PAYMENTS}/export?mode=UPI"))
    assert (
        rows[0][:4] == ["Receipt", "Date", "Client", "Amount"]
        and rows[1][2] == "Ee paid"
        and rows[1][3] == "100000.00"
    )


# ---- Query budgets ---------------------------------------------------------------------------------


def test_query_budgets(client_for, admin, make_ledger, make_lead, make_payment):
    ledgers = [make_ledger(lead=make_lead(name=f"Q{i:02d}")) for i in range(20)]
    for ledger in ledgers[:5]:
        make_payment(ledger, "10.00")
    c = client_for(admin)
    with CaptureQueriesContext(connection) as list_q:
        assert c.get(LEDGERS).status_code == 200
    assert len(list_q) < 8, [q["sql"][:90] for q in list_q]
    with CaptureQueriesContext(connection) as detail_q:
        assert c.get(f"{LEDGERS}/{ledgers[0].pk}").status_code == 200
    assert len(detail_q) < 12
    with CaptureQueriesContext(connection) as pay_q:
        assert c.get(PAYMENTS).status_code == 200
    assert len(pay_q) < 8
    with CaptureQueriesContext(connection) as sum_q:
        assert c.get(f"{LEDGERS}/summary").status_code == 200
    assert len(sum_q) < 8
    assert Payment.objects.count() == 5


def test_the_admin_dashboard_matches_the_ledger_summary(client_for, admin, book):
    dash = client_for(admin).get("/api/v1/dashboard/admin?period=all").json()
    summary = client_for(admin).get(f"{LEDGERS}/summary").json()
    kpis = dash["kpis"]
    assert kpis["received"] == summary["received"] == "165000.00"
    assert kpis["outstanding"] == summary["outstanding"]
    assert kpis["outstanding_overdue"] == summary["overdue_amount"]
    assert kpis["outstanding_clients"] == summary["clients_with_balance"]
    assert dash["collections_aging"] == summary["aging"]
    assert [t["ledger_id"] for t in dash["top_overdue_clients"]] == [
        t["ledger"] for t in summary["top_overdue"]
    ]
