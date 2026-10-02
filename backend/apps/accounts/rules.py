# ruff: noqa: E501
"""Business rules for accounts. Change a number here, nowhere else."""

ACCOUNTS_ROLES = {"ADMIN"}
# Finalizing a won deal (the first close) is also the Sales Manager's. Revising the total afterwards
# (a correction), payments, voids and every other accounts screen stay ACCOUNTS_ROLES only.
FINALIZE_ROLES = {"ADMIN", "SALES_MANAGER"}
PAYMENT_REQUIRES_FINALIZED = True
BLOCK_OVERPAYMENT = True
PAYMENT_BACKDATE_DAYS = 90
DUPLICATE_WINDOW_SECONDS = 60
PAYMENT_OVERDUE_DAYS = 30
AGING_BUCKETS = ("0-30", "31-60", "61-90", "90+")
MAX_PROOF_BYTES = 5 * 1024 * 1024
PROOF_MAX_SIDE = 1600
MAX_AMOUNT_DIGITS = 10  # before the decimal point (Decimal(12, 2))
NOTE_MAX = 300
EXPORT_MAX_ROWS = 5000
COMPANY_NAME = "ARQUS Sports Consultancy"
