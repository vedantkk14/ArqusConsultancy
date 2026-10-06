"""Invoices (admin only): make, list with search, edit, PDF, email and WhatsApp."""

from decimal import Decimal

import pytest
from django.core import mail

from apps.invoices import services
from apps.invoices.models import Invoice

from .conftest import BASE, payload

pytestmark = pytest.mark.django_db


def _make(client, **over):
    res = client.post(BASE, payload(**over), format="json")
    assert res.status_code == 201, res.content
    return res.json()


def test_only_the_admin_can_use_invoices(client_for, make_user):
    for role in ("SALES_MANAGER", "SALES_EXEC", "PROJECT_MANAGER"):
        c = client_for(make_user(role))
        assert c.get(BASE).status_code == 403
        assert c.post(BASE, payload(), format="json").status_code == 403
    assert client_for().get(BASE).status_code == 401
    assert Invoice.objects.count() == 0


def test_creating_calculates_every_figure(client_for, admin):
    body = _make(client_for(admin))
    assert body["invoice_no"] == "2026-27/200"  # exactly what the admin typed
    assert body["subtotal"] == "38100.00" and body["tax_amount"] == "6858.00"
    assert body["total"] == "44958.00" and body["round_off"] == "0.00"
    assert body["items"][0]["amount"] == "38100.00"
    assert body["client_gstin"] == "24AAQFH0005A1Z6"  # upper-cased
    assert body["amount_in_words"] == "Forty Four Thousand Nine Hundred And Fifty Eight"
    assert body["company"]["gstin"] == "27CPEPD8900B1ZC" and body["company"]["name"]


def test_the_invoice_name_is_editable_and_falls_back_to_the_client(client_for, admin):
    c = client_for(admin)
    assert _make(c)["title"] == "Cycle track - Harmony Infra"
    assert _make(c, invoice_no="2", title="")["title"] == "HARMONY INFRA"


def test_gst_is_blank_unless_the_admin_sets_it(client_for, admin):
    c = client_for(admin)
    none = _make(c, gst_percent=None)
    assert none["gst_percent"] is None and none["tax_amount"] == "0.00"
    assert none["total"] == "38100.00"
    split = _make(c, invoice_no="3", tax_type="CGST_SGST", gst_percent="12")
    assert split["figures"] == {"cgst": "2286.00", "sgst": "2286.00"}
    assert split["total"] == "42672.00"
    bad = c.post(BASE, payload(invoice_no="4", gst_percent="150"), format="json")
    assert bad.status_code == 400 and "gst_percent" in bad.json()["error"]["details"]


def test_the_invoice_number_is_the_admins_and_must_be_unique_ignoring_case(client_for, admin):
    c = client_for(admin)
    _make(c, invoice_no="INV/Alpha")
    again = c.post(BASE, payload(invoice_no="inv/alpha"), format="json")
    assert again.status_code == 400 and "invoice_no" in again.json()["error"]["details"]
    blank = c.post(BASE, payload(invoice_no="  "), format="json")
    assert blank.status_code == 400
    assert Invoice.objects.count() == 1


def test_validation_needs_a_client_and_at_least_one_good_line(client_for, admin):
    c = client_for(admin)
    assert c.post(BASE, payload(client_name=""), format="json").status_code == 400
    assert c.post(BASE, payload(items=[]), format="json").status_code == 400
    bad_item = {"particulars": "x", "quantity": "0", "rate": "5"}
    assert c.post(BASE, payload(items=[bad_item]), format="json").status_code == 400
    negative = {"particulars": "x", "quantity": "1", "rate": "-5"}
    assert c.post(BASE, payload(items=[negative]), format="json").status_code == 400
    assert Invoice.objects.count() == 0


def test_a_quantity_can_have_four_decimals_like_the_sample(client_for, admin):
    item = {"particulars": "Track", "quantity": "8304.0948", "rate": "381.00", "unit": "Sq.ft"}
    body = _make(client_for(admin), items=[item], gst_percent="18")
    assert body["items"][0]["quantity"] == "8304.0948"
    assert Decimal(body["subtotal"]) == Decimal("3163860.12")


def test_the_list_is_newest_first_and_searchable(client_for, admin):
    c = client_for(admin)
    _make(c, invoice_no="A-1", title="Turf for Badagu", client_name="Badagu Sports")
    _make(c, invoice_no="B-2", title="Cycle track", client_name="Harmony Infra",
          invoice_date="2026-09-01")  # fmt: skip
    rows = c.get(BASE).json()["results"]
    assert [r["invoice_no"] for r in rows] == ["B-2", "A-1"]
    assert set(rows[0]) >= {"id", "invoice_no", "title", "client_name", "invoice_date", "total"}
    for term, expected in (("badagu", ["A-1"]), ("B-2", ["B-2"]), ("cycle", ["B-2"]), ("zzz", [])):
        found = c.get(BASE, {"q": term}).json()["results"]
        assert [r["invoice_no"] for r in found] == expected, term


def test_editing_replaces_the_lines_and_recalculates(client_for, admin):
    c = client_for(admin)
    made = _make(c)
    new_items = [
        {"particulars": "Line A", "quantity": "2", "rate": "100", "unit": "Nos"},
        {"particulars": "Line B", "quantity": "1", "rate": "50.50", "unit": "Nos"},
    ]
    res = c.patch(
        f"{BASE}/{made['id']}",
        payload(items=new_items, title="Renamed", gst_percent="5"),
        format="json",
    )
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["title"] == "Renamed" and len(body["items"]) == 2
    assert body["subtotal"] == "250.50" and body["tax_amount"] == "12.53"  # 12.525 half up
    assert body["total"] == "263.00" and body["round_off"] == "-0.03"
    assert Invoice.objects.get().items.count() == 2
    # Keeping its own number while editing is fine; taking another invoice's is not.
    _make(c, invoice_no="OTHER")
    clash = c.patch(f"{BASE}/{made['id']}", payload(invoice_no="other"), format="json")
    assert clash.status_code == 400


def test_the_pdf_is_a_real_pdf_with_a_download_option(client_for, admin):
    c = client_for(admin)
    made = _make(c, items=payload()["items"] * 30)  # a long invoice runs onto more pages
    res = c.get(f"{BASE}/{made['id']}/pdf")
    assert res.status_code == 200 and res["Content-Type"] == "application/pdf"
    assert res.content.startswith(b"%PDF") and len(res.content) > 5000
    assert (
        res["Content-Disposition"].startswith("inline")
        and "Invoice-2026-27-200.pdf" in res["Content-Disposition"]
    )
    dl = c.get(f"{BASE}/{made['id']}/pdf", {"download": "1"})
    assert dl["Content-Disposition"].startswith("attachment")
    assert c.get(f"{BASE}/99999/pdf").status_code == 404


def test_emailing_attaches_the_pdf_and_records_it(client_for, admin):
    c = client_for(admin)
    made = _make(c)
    res = c.post(f"{BASE}/{made['id']}/email", {"message": "Thank you!"}, format="json")
    assert res.status_code == 200, res.content
    assert res.json()["sent_to"] == "accounts@harmony.example"
    assert res.json()["invoice"]["emailed_at"]
    (msg,) = mail.outbox
    assert msg.to == ["accounts@harmony.example"] and msg.reply_to == [admin.email]
    assert "2026-27/200" in msg.subject
    assert "Rs. 44,958.00" in msg.body and "Thank you!" in msg.body
    names = {a[0] if isinstance(a, tuple) else None for a in msg.attachments}
    assert "Invoice-2026-27-200.pdf" in names
    pdf = next(a for a in msg.attachments if isinstance(a, tuple) and a[2] == "application/pdf")
    assert pdf[1].startswith(b"%PDF")


def test_emailing_to_another_address_or_with_none_on_file(client_for, admin):
    c = client_for(admin)
    made = _make(c, client_email="")
    assert c.post(f"{BASE}/{made['id']}/email", {}, format="json").status_code == 400
    res = c.post(f"{BASE}/{made['id']}/email", {"to": "boss@example.com"}, format="json")
    assert res.status_code == 200 and mail.outbox[0].to == ["boss@example.com"]


def test_a_failed_email_is_reported_without_details_and_not_recorded(
    client_for, admin, monkeypatch
):
    from django.core.mail import EmailMultiAlternatives

    def boom(*args, **kwargs):
        raise OSError("smtp password wrong")

    monkeypatch.setattr(EmailMultiAlternatives, "send", boom)
    c = client_for(admin)
    made = _make(c)
    res = c.post(f"{BASE}/{made['id']}/email", {}, format="json")
    assert res.status_code == 502 and "smtp" not in res.content.decode().lower()
    assert Invoice.objects.get().emailed_at is None


def test_whatsapp_gives_a_chat_link_with_a_private_pdf_link(client_for, admin):
    c = client_for(admin)
    made = _make(c)
    res = c.post(f"{BASE}/{made['id']}/whatsapp", {}, format="json")
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["url"].startswith("https://wa.me/919812345678?text=")
    assert "Rs. 44,958.00" in body["text"] and body["link"] in body["text"]
    assert "/api/v1/invoices/shared/" in body["link"]
    assert body["invoice"]["whatsapp_at"]
    # The link opens the PDF with no login.
    token = body["link"].rsplit("/", 1)[-1]
    public = client_for().get(f"/api/v1/invoices/shared/{token}")
    assert public.status_code == 200 and public.content.startswith(b"%PDF")
    assert public["X-Robots-Tag"] == "noindex, nofollow"


def test_the_shared_link_rejects_tampered_and_expired_tokens(client_for, admin, monkeypatch):
    c = client_for(admin)
    made = _make(c)
    token = services.make_token(Invoice.objects.get(pk=made["id"]))
    anon = client_for()
    assert anon.get(f"/api/v1/invoices/shared/{token[:-3]}abc").status_code == 404
    assert anon.get("/api/v1/invoices/shared/not-a-token").status_code == 404
    monkeypatch.setattr(services, "LINK_DAYS", -1)
    assert anon.get(f"/api/v1/invoices/shared/{token}").status_code == 404


def test_whatsapp_needs_a_usable_number(client_for, admin):
    c = client_for(admin)
    made = _make(c, client_phone="")
    assert c.post(f"{BASE}/{made['id']}/whatsapp", {}, format="json").status_code == 400
    ok = c.post(f"{BASE}/{made['id']}/whatsapp", {"phone": "+91 98765 43210"}, format="json")
    assert ok.status_code == 200 and "wa.me/919876543210" in ok.json()["url"]
