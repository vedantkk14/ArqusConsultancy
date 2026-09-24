"""Small pure helpers (mirrored in frontend/src/app/features/leads/utils/phone.ts)."""

import re

INDIA_PREFIX = "+91"


class InvalidPhone(ValueError):
    pass


def normalize_phone(raw: str) -> str:
    """Return the phone in E.164 form, e.g. "098765 43210" -> "+919876543210".

    Rules: strip everything but digits; drop one leading 0; a 10-digit number starting 6-9 gets +91;
    12 digits starting 91 get "+"; any other number must have been typed with a leading "+" and have
    8-15 digits. Anything else raises InvalidPhone.
    """
    text = (raw or "").strip()
    has_plus = text.startswith("+")
    digits = re.sub(r"\D", "", text)
    if not has_plus and digits.startswith("0"):
        digits = digits[1:]
    if not has_plus and len(digits) == 10 and digits[0] in "6789":
        return INDIA_PREFIX + digits
    if len(digits) == 12 and digits.startswith("91") and digits[2] in "6789":
        return "+" + digits
    if has_plus and 8 <= len(digits) <= 15:
        return "+" + digits
    raise InvalidPhone("Enter a valid mobile number, e.g. 98765 43210.")


def phone_digits(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


def csv_safe(value) -> str:
    """Neutralise spreadsheet formulas: prefix cells starting with = + - @ with an apostrophe."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text
