"""Business rules for projects and expenses. Change a number here, nowhere else."""

from decimal import Decimal

SUGGESTED_BUDGET_PCT = 60  # suggested sanctioned budget = this % of the deal total
WARN_PCT = 80  # usage from here (inclusive) is "warn"
OVER_PCT = 100  # usage above this is "over"
BLOCK_OVER_BUDGET = True  # an expense that would exceed the sanctioned budget is refused
BACKDATE_DAYS = 30  # an expense can be dated at most this many days back
PM_EDIT_WINDOW_MINUTES = 30  # the logging PM may edit or void their own expense this long
RECEIPT_REQUIRED = True
RECEIPT_EXEMPT_CATEGORIES = ("LABOUR",)
MAX_RECEIPT_BYTES = 5 * 1024 * 1024
RECEIPT_MAX_SIDE = 1600
MAX_AMOUNT_DIGITS = 10  # before the decimal point (Decimal(12, 2))
DESCRIPTION_MAX = 500
EXPORT_MAX_ROWS = 5000
ALERTS_MAX_ROWS = 200

ZERO = Decimal("0.00")
