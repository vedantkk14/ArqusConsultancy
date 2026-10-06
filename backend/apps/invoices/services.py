"""Creating, editing and sending invoices."""

import logging
import re
from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone

from apps.core.email_html import build_message

from . import calc
from .company import COMPANY
from .exceptions import InvoiceEmailFailed, NoRecipient
from .models import Invoice, InvoiceItem
from .pdf import render_invoice_pdf

logger = logging.getLogger(__name__)

TOKEN_SALT = "invoice-pdf"
#: How long the WhatsApp download link works.
LINK_DAYS = 30


def _save_items(invoice: Invoice, items: list[dict]) -> dict:
    invoice.items.all().delete()
    figures = calc.compute(
        [(i["quantity"], i["rate"]) for i in items], invoice.gst_percent, invoice.tax_type
    )
    InvoiceItem.objects.bulk_create(
        InvoiceItem(
            invoice=invoice,
            position=index,
            particulars=item["particulars"].strip(),
            hsn=item.get("hsn", "").strip(),
            quantity=item["quantity"],
            rate=item["rate"],
            unit=item.get("unit", "").strip(),
            amount=figures["amounts"][index],
        )
        for index, item in enumerate(items)
    )
    invoice.subtotal = figures["subtotal"]
    invoice.tax_amount = figures["tax"]
    invoice.round_off = figures["round_off"]
    invoice.total = figures["total"]
    invoice.save(update_fields=["subtotal", "tax_amount", "round_off", "total", "updated_at"])
    return figures


def _apply(invoice: Invoice, data: dict) -> None:
    for field in (
        "invoice_no",
        "invoice_date",
        "client_name",
        "client_address",
        "client_gstin",
        "client_phone",
        "client_email",
        "tax_type",
        "gst_percent",
    ):
        setattr(invoice, field, data[field])
    invoice.client_name = invoice.client_name.strip()
    invoice.title = (data.get("title") or "").strip() or invoice.client_name


@transaction.atomic
def create_invoice(data: dict, by) -> Invoice:
    invoice = Invoice(created_by=by)
    _apply(invoice, data)
    invoice.save()
    _save_items(invoice, data["items"])
    return invoice


@transaction.atomic
def update_invoice(invoice: Invoice, data: dict) -> Invoice:
    _apply(invoice, data)
    invoice.save()
    _save_items(invoice, data["items"])
    return invoice


# ---- Sending ----------


def filename(invoice: Invoice) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", invoice.invoice_no).strip("-") or str(invoice.pk)
    return f"Invoice-{safe}.pdf"


def email_invoice(invoice: Invoice, by, *, to: str = "", message: str = "") -> str:
    """Email the invoice as a PDF attachment, straight away (the caller sees a failure at once)."""
    address = (to or invoice.client_email).strip()
    if not address:
        raise NoRecipient()
    intro = (
        f"Hi {invoice.client_name},\n\n"
        f"Please find attached invoice {invoice.invoice_no} dated "
        f"{calc.ordinal_date(invoice.invoice_date)} for {invoice.title}.\n"
        f"Amount payable: Rs. {calc.indian(invoice.total)}."
    )
    note = (message or "").strip()
    text = intro + (f"\n\n{note}" if note else "")
    text += f"\n\nRegards,\n{by.display_name}\n{COMPANY['short_name']}"
    try:
        email = build_message(
            f"Invoice {invoice.invoice_no} from {COMPANY['short_name']}",
            text,
            settings.DEFAULT_FROM_EMAIL,
            address,
            by.email or None,
            {},
            attachments=[(filename(invoice), render_invoice_pdf(invoice), "application/pdf")],
        )
        email.send(fail_silently=False)
    except Exception:  # noqa: BLE001 - never leak mail-system details to the client
        logger.exception("Could not email invoice %s", invoice.pk)
        raise InvoiceEmailFailed() from None
    invoice.emailed_at = timezone.now()
    invoice.save(update_fields=["emailed_at", "updated_at"])
    return address


def make_token(invoice: Invoice) -> str:
    return signing.dumps({"i": invoice.pk}, salt=TOKEN_SALT)


def invoice_from_token(token: str) -> Invoice | None:
    try:
        data = signing.loads(token, salt=TOKEN_SALT, max_age=LINK_DAYS * 86400)
        return Invoice.objects.filter(pk=data["i"]).first()
    except (signing.BadSignature, KeyError, TypeError):
        return None


def _digits(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return f"91{digits}" if len(digits) == 10 else digits


def whatsapp_invoice(invoice: Invoice, by, *, phone: str, link: str) -> dict:
    """The wa.me link and its text. A WhatsApp link cannot carry an attachment, so the message holds
    a private download link to the PDF (it works for LINK_DAYS days)."""
    digits = _digits(phone or invoice.client_phone)
    if not 8 <= len(digits) <= 15:
        raise NoRecipient()
    text = (
        f"Hi {invoice.client_name}, here is invoice {invoice.invoice_no} from "
        f"{COMPANY['short_name']} for {invoice.title}.\n"
        f"Amount payable: Rs. {calc.indian(invoice.total)}\n"
        f"Download the PDF: {link}\n\nRegards, {by.display_name}"
    )
    invoice.whatsapp_at = timezone.now()
    invoice.save(update_fields=["whatsapp_at", "updated_at"])
    return {
        "url": f"https://wa.me/{digits}?text={quote(text, safe='')}",
        "text": text,
        "link": link,
    }
