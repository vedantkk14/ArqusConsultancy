"""Title and body per notification type, filled from the payload."""

from decimal import Decimal, InvalidOperation

DATA_VALUE_MAX = 200


class _Blank(dict):
    def __missing__(self, key):
        return ""


def inr(value) -> str:
    """ "250000.00" -> "₹2,50,000" (Indian digit grouping, paise only when present)."""
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return ""
    whole, _, frac = f"{abs(amount):.2f}".partition(".")
    head, tail = whole[:-3], whole[-3:]
    while len(head) > 2:
        head, tail = head[:-2], head[-2:] + "," + tail
    grouped = (head + "," + tail) if head else tail
    text = f"₹{grouped}" + (f".{frac}" if frac != "00" else "")
    return f"-{text}" if amount < 0 else text


#: type -> (title, body). Placeholders come from the payload; money keys are shown with inr().
TEMPLATES: dict[str, tuple[str, str]] = {
    "lead_assigned": ("New lead assigned", "{lead_name} was assigned to you."),
    "lead_reassigned_away": ("Lead reassigned", "{lead_name} was reassigned to a colleague."),
    "lead_won": ("Deal won", "{lead_name} was won for {proposed_amount} by {won_by}."),
    "lead_won_reversed": ("Won deal reversed", "{lead_name} was marked lost by {reversed_by}."),
    "budget_warn": ("Budget warning", "{project_name} has used {usage_pct}% of its budget."),
    "budget_over": ("Budget exceeded", "{project_name} is over its sanctioned budget."),
    "payment_received": ("Payment received", "{client_name} paid {amount}."),
    "account_created": ("Welcome to ARQUS", "Your account is ready. Sign in to get started."),
}
MONEY_KEYS = {"proposed_amount", "amount", "total_amount"}


def render(type_: str, payload: dict | None) -> tuple[str, str]:
    payload = payload or {}
    shown = _Blank({k: (inr(v) if k in MONEY_KEYS else v) for k, v in payload.items()})
    title, body = TEMPLATES.get(
        type_, (type_.replace("_", " ").capitalize(), payload.get("message", ""))
    )
    return title.format_map(shown)[:200], body.format_map(shown)


def small_data(payload: dict | None) -> dict:
    """Keep only short scalar values, so `data` stays small and always JSON-safe."""
    out = {}
    for key, value in (payload or {}).items():
        if value is None or isinstance(value, (bool, int, float)):
            out[str(key)] = value
        else:
            out[str(key)] = str(value)[:DATA_VALUE_MAX]
    return out
