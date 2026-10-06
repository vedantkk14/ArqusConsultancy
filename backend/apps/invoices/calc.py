"""Invoice maths and number formatting in one place (the frontend mirrors it for its live total)."""

from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ONE = Decimal("1")

_ONES = (
    "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen "
    "Fifteen Sixteen Seventeen Eighteen Nineteen"
).split()
_TENS = "_ _ Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split()


def money(value) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def line_amount(quantity, rate) -> Decimal:
    return money(Decimal(quantity) * Decimal(rate))


def compute(lines, gst_percent, tax_type) -> dict:
    """`lines` is [(quantity, rate)]. Returns every figure an invoice shows.

    The total is rounded to the nearest rupee; the difference is shown as "Round off".
    CGST + SGST split the tax in half (the odd paisa goes to SGST).
    """
    amounts = [line_amount(q, r) for q, r in lines]
    subtotal = sum(amounts, Decimal("0.00"))
    pct = Decimal(gst_percent) if gst_percent else Decimal("0")
    tax = money(subtotal * pct / 100) if pct else Decimal("0.00")
    cgst = money(tax / 2) if tax_type == "CGST_SGST" else Decimal("0.00")
    sgst = tax - cgst if tax_type == "CGST_SGST" else Decimal("0.00")
    raw = subtotal + tax
    total = raw.quantize(ONE, rounding=ROUND_HALF_UP).quantize(CENT)
    return {
        "amounts": amounts,
        "subtotal": subtotal,
        "tax": tax,
        "cgst": cgst,
        "sgst": sgst,
        "round_off": total - raw,
        "total": total,
    }


def indian(value) -> str:
    """31,63,860.17: lakh and crore grouping, always two decimals."""
    text = f"{money(value):.2f}"
    sign = "-" if text.startswith("-") else ""
    whole, _, paise = text.lstrip("-").partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{sign}{whole}.{paise}"


def _below_hundred(n: int) -> str:
    return _ONES[n] if n < 20 else _TENS[n // 10] + (f" {_ONES[n % 10]}" if n % 10 else "")


def _below_thousand(n: int) -> str:
    hundreds, rest = divmod(n, 100)
    if not hundreds:
        return _below_hundred(rest)
    if not rest:
        return f"{_ONES[hundreds]} Hundred"
    return f"{_ONES[hundreds]} Hundred And {_below_hundred(rest)}"


def in_words(value) -> str:
    """Indian system: 3733355 is "Thirty Seven Lakh Thirty Three Thousand Three Hundred And Fifty
    Five". Whole rupees only (invoice totals are rounded)."""
    n = int(money(value))
    if n == 0:
        return "Zero"
    parts = []
    for size, name in ((10_000_000, "Crore"), (100_000, "Lakh"), (1_000, "Thousand")):
        count, n = divmod(n, size)
        if count:
            parts.append(f"{_below_hundred(count)} {name}")
    if n:
        parts.append(_below_thousand(n))
    return " ".join(parts)


def ordinal_date(day) -> str:
    """24th August 2026."""
    suffix = (
        "th" if 10 <= day.day % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(day.day % 10, "th")
    )
    return f"{day.day}{suffix} {day:%B %Y}"
