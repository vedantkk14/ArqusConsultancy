# ruff: noqa: E501
"""Small pure helpers."""

from decimal import ROUND_HALF_UP, Decimal

_ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
]  # fmt: skip
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _below_hundred(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return _TENS[n // 10] + (f" {_ONES[n % 10]}" if n % 10 else "")


def _below_thousand(n: int) -> str:
    hundreds, rest = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(f"{_ONES[hundreds]} Hundred")
    if rest:
        parts.append(_below_hundred(rest))
    return " ".join(parts)


def _indian_number(n: int) -> str:
    """0 -> "Zero", 120000 -> "One Lakh Twenty Thousand" (crore, lakh, thousand)."""
    if n == 0:
        return "Zero"
    parts = []
    for size, name in ((10_000_000, "Crore"), (100_000, "Lakh"), (1_000, "Thousand")):
        count, n = divmod(n, size)
        if count:
            parts.append(f"{_indian_number(count)} {name}")
    if n:
        parts.append(_below_thousand(n))
    return " ".join(parts)


def to_indian_words(amount) -> str:
    """Decimal(120000) -> "Rupees One Lakh Twenty Thousand Only"; paise are added when present."""
    value = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rupees, paise = divmod(int(value * 100), 100)
    text = f"Rupees {_indian_number(rupees)}"
    if paise:
        text += f" and {_below_hundred(paise)} Paise"
    return text + " Only"


def receipt_number(payment) -> str:
    """RC-<year of the payment date>-<id, six digits>."""
    return f"RC-{payment.received_on.year}-{payment.pk:06d}"


def csv_safe(value) -> str:
    """Neutralise spreadsheet formulas: prefix cells starting with = + - @ (or a tab) with an apostrophe."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def format_inr(amount) -> str:
    """Decimal("120000") -> "₹1,20,000.00" (Indian digit grouping, always two decimals)."""
    value = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if value < 0 else ""
    whole, frac = f"{abs(value):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups) + "," + tail
    return f"{sign}₹{whole}.{frac}"
