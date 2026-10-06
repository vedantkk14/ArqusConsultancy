"""The tax invoice as a PDF, laid out like the ARQUS sample (logo and company block, TAX INVOICE,
bill to / bill from boxes, items table, tax and total, amount in words, certification and stamp)."""

import io
from decimal import Decimal
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from . import calc
from .company import COMPANY

ASSETS = Path(__file__).parent / "assets"
LOGO = Path(__file__).resolve().parent.parent / "core" / "email_assets" / "logo.png"
STAMP = ASSETS / "stamp.png"  # the signature and company stamp, from a photo, on white

BLUE = colors.HexColor("#0B5CD5")
HEAD_BG = colors.HexColor("#F1F3F6")
#: Like a printed invoice: the items area (header included) is at least this tall, and there is
#: always some breathing room under the last item before the totals. More items grow it from there.
MIN_BODY_HEIGHT = 45 * mm
BODY_GAP = 10 * mm
INK = colors.black

PAGE_W, PAGE_H = A4
MARGIN = 14 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def _style(name, font="Helvetica", size=9, leading=None, align=TA_LEFT, color=INK, **kw):
    return ParagraphStyle(
        name, fontName=font, fontSize=size, leading=leading or size * 1.3, alignment=align,
        textColor=color, **kw,
    )  # fmt: skip


S_COMPANY = _style("company", "Helvetica-Bold", 9.5, align=TA_RIGHT)
S_COMPANY_LINE = _style("companyline", size=8.6, leading=11.5, align=TA_RIGHT)
S_TITLE = _style("title", "Helvetica-Bold", 14, align=TA_CENTER)
S_META = _style("meta", "Helvetica-Oblique", 9, align=TA_RIGHT)
S_BOX = _style("box", size=8.8, leading=11.8)
S_BOX_HEAD = _style("boxhead", "Helvetica-BoldOblique", 8.8, leading=12)
S_BOX_NAME = _style("boxname", "Helvetica-Bold", 9.2, leading=12)
S_TH = _style("th", "Helvetica-Bold", 9, align=TA_CENTER)
S_CELL = _style("cell", "Helvetica-Bold", 8.6, leading=11.5)
S_CELL_C = _style("cellc", "Helvetica-Bold", 8.8, align=TA_CENTER)
S_NUM = _style("num", size=8.8, align=TA_CENTER)
S_NUM_R = _style("numr", size=8.8, align=TA_RIGHT)
S_NUM_RB = _style("numrb", "Helvetica-Bold", 8.8, align=TA_RIGHT)
S_LABEL_R = _style("labelr", size=8.8, align=TA_RIGHT)
S_LABEL_RB = _style("labelrb", "Helvetica-Bold", 9.2, align=TA_RIGHT)
S_WORDS = _style("words", "Times-BoldItalic", 10)
S_CERT = _style("cert", "Times-BoldItalic", 10.5, leading=15, leftIndent=8 * mm)


def _p(text, style):
    """A paragraph from plain text: escaped, with line breaks kept."""
    return Paragraph(escape(text or "").replace("\n", "<br/>"), style)


def _qty(value: Decimal) -> str:
    """As typed: up to four decimals, trailing zeros dropped (100, 8,304.09, 8,304.0948)."""
    return f"{value:,.4f}".rstrip("0").rstrip(".")


def _percent(value) -> str:
    return f"{Decimal(value).normalize():f}"


def _header() -> list:
    logo = Image(str(LOGO), width=52 * mm, height=52 * mm * 296 / 500)
    link = f'<font color="#0B5CD5"><u>{COMPANY["email"]}</u></font>'
    site = f'<font color="#0B5CD5"><u>{COMPANY["website"]}</u></font>'
    block = [
        Paragraph(COMPANY["name"], S_COMPANY),
        *[Paragraph(escape(line), S_COMPANY_LINE) for line in COMPANY["address_lines"]],
        Paragraph(f"Ph no - {escape(COMPANY['phone'])}", S_COMPANY_LINE),
        Paragraph(f'<link href="mailto:{COMPANY["email"]}">{link}</link>', S_COMPANY_LINE),
        Paragraph(f'<link href="https://{COMPANY["website"]}">{site}</link>', S_COMPANY_LINE),
        Paragraph(f"PAN:{COMPANY['pan']} GSTIN:{COMPANY['gstin']}", S_COMPANY_LINE),
    ]
    head = Table([[logo, block]], colWidths=[CONTENT_W * 0.4, CONTENT_W * 0.6])
    head.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    rule = HRFlowable(width="100%", thickness=0.8, color=INK, spaceBefore=4, spaceAfter=4)
    return [head, Spacer(1, 3 * mm), rule, Paragraph("TAX INVOICE", S_TITLE), rule]


def _parties(invoice) -> Table:
    bill_to = [Paragraph("BILL TO/SHIP TO:", S_BOX_HEAD), _p(invoice.client_name, S_BOX_NAME)]
    if invoice.client_address:
        bill_to.append(_p(invoice.client_address, S_BOX))
    if invoice.client_gstin:
        bill_to.append(_p(f"GSTIN:{invoice.client_gstin}", S_BOX))
    if invoice.client_phone:
        bill_to.append(_p(f"Ph: {invoice.client_phone}", S_BOX))
    bill_from = [
        Paragraph("BILL FROM:", S_BOX_HEAD),
        _p(COMPANY["name"], S_BOX_NAME),
        _p(COMPANY["email"], S_BOX),
        _p(COMPANY["website"], S_BOX),
        _p(f"PAN: {COMPANY['pan']}", S_BOX),
        _p(f"GSTIN: {COMPANY['gstin']}", S_BOX),
    ]
    table = Table([[bill_to, bill_from]], colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, INK),
                ("LINEAFTER", (0, 0), (0, 0), 0.8, INK),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 28),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _items_table(invoice, figures: dict) -> Table:
    """One clean box: header, item rows with the column lines running all the way down, then the
    sub total / GST / round off / TOTAL rows across the full width."""
    widths = [13 * mm, 70 * mm, 22 * mm, 22 * mm, 19 * mm, 14 * mm]
    widths.append(CONTENT_W - sum(widths))
    head = [
        [
            Paragraph(t, S_TH)
            for t in ("Sr<br/>no", "Particulars", "HSN", "Qty", "Rate", "Unit", "Total")
        ]
    ]
    items = list(invoice.items.all())
    body = []
    for index, item in enumerate(items):
        body.append(
            [
                Paragraph(f"{index + 1:02d}", S_NUM),
                _p(item.particulars, S_CELL),
                Paragraph(escape(item.hsn or ""), S_CELL_C),
                Paragraph(_qty(item.quantity), S_CELL_C),
                Paragraph(calc.indian(item.rate), S_NUM),
                Paragraph(escape(item.unit or ""), S_NUM),
                Paragraph(calc.indian(figures["amounts"][index]), S_NUM_R),
            ]
        )
    totals: list[tuple[str, Decimal, bool]] = []
    if figures["tax"] or len(items) > 1:
        totals.append(("Sub Total", figures["subtotal"], False))
    pct = invoice.gst_percent
    if figures["tax"] and pct:
        if invoice.tax_type == "CGST_SGST":
            half = _percent(Decimal(pct) / 2)
            totals.append((f"CGST @ {half}%", figures["cgst"], False))
            totals.append((f"SGST @ {half}%", figures["sgst"], False))
        else:
            totals.append((f"IGST @ {_percent(pct)}%", figures["tax"], False))
    if figures["round_off"]:
        totals.append(("Round off", figures["round_off"], False))
    totals.append(("TOTAL", figures["total"], True))

    base = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    probe = Table(head + body, colWidths=widths)
    probe.setStyle(TableStyle(base))
    _, used = probe.wrap(CONTENT_W, 10**6)
    gap = max(BODY_GAP, MIN_BODY_HEIGHT - used)

    rows = head + body + [[""] * 7]
    filler_row = len(rows) - 1
    first_total = len(rows)
    for label, value, bold in totals:
        rows.append(
            [
                Paragraph(escape(label), S_LABEL_RB if bold else S_LABEL_R),
                "", "", "", "", "",
                Paragraph(calc.indian(value), S_NUM_RB if bold else S_NUM_R),
            ]
        )  # fmt: skip
    table = Table(
        rows,
        colWidths=widths,
        rowHeights=[None] * filler_row + [gap] + [None] * len(totals),
        repeatRows=1,
    )
    style = [
        *base,
        ("BOX", (0, 0), (-1, -1), 1, INK),
        ("LINEBELOW", (0, 0), (-1, 0), 1, INK),
        ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
    ]
    for col in range(1, 7):  # the column lines run from the header down to the totals
        style.append(("LINEBEFORE", (col, 0), (col, filler_row), 0.8, INK))
    for row in range(first_total, len(rows)):
        last = row == len(rows) - 1
        style += [
            ("SPAN", (0, row), (5, row)),
            ("LINEABOVE", (0, row), (-1, row), 1 if row == first_total else 0.8, INK),
            ("LINEBEFORE", (6, row), (6, row), 0.8, INK),
            ("VALIGN", (0, row), (-1, row), "MIDDLE"),
        ]
        if last:
            style.append(("BACKGROUND", (0, row), (-1, row), HEAD_BG))
    table.setStyle(TableStyle(style))
    return table


def _footer(figures: dict) -> list:
    words = f"IN WORDS: {calc.in_words(figures['total'])}"
    cert = (
        "Certified that the particulars given above are true and correct. "
        f'For - "{COMPANY["short_name"]}." (Authorized Signatory)'
    )
    block = [
        Spacer(1, 2 * mm),
        Paragraph(escape(words), S_WORDS),
        Spacer(1, 7 * mm),
        Paragraph(escape(cert), S_CERT),
    ]
    if STAMP.exists():
        width = 58 * mm
        stamp = Image(str(STAMP), width=width, height=width * 282 / 1000)
        stamp.hAlign = "RIGHT"
        block += [Spacer(1, 5 * mm), stamp]
    return [KeepTogether(block)]


def render_invoice_pdf(invoice) -> bytes:
    figures = calc.compute(
        [(i.quantity, i.rate) for i in invoice.items.all()], invoice.gst_percent, invoice.tax_type
    )
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=12 * mm,
        bottomMargin=14 * mm,
        title=f"Invoice {invoice.invoice_no}",
        author=COMPANY["short_name"],
    )
    meta = [
        Paragraph(f"Date: {calc.ordinal_date(invoice.invoice_date)}", S_META),
        Paragraph(f"Invoice No: {escape(invoice.invoice_no)}", S_META),
    ]
    story = [
        *_header(),
        Spacer(1, 5 * mm),
        *meta,
        Spacer(1, 4 * mm),
        _parties(invoice),
        Spacer(1, 9 * mm),
        _items_table(invoice, figures),
        *_footer(figures),
    ]
    doc.build(story)
    return buffer.getvalue()
