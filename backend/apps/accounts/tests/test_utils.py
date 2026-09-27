# ruff: noqa: E501
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest

from apps.accounts.utils import csv_safe, format_inr, receipt_number, to_indian_words


@pytest.mark.parametrize(
    "amount, words",
    [
        ("0", "Rupees Zero Only"),
        ("0.01", "Rupees Zero and One Paise Only"),
        ("0.50", "Rupees Zero and Fifty Paise Only"),
        ("1", "Rupees One Only"),
        ("10", "Rupees Ten Only"),
        ("19", "Rupees Nineteen Only"),
        ("21", "Rupees Twenty One Only"),
        ("99", "Rupees Ninety Nine Only"),
        ("100", "Rupees One Hundred Only"),
        ("101", "Rupees One Hundred One Only"),
        ("999", "Rupees Nine Hundred Ninety Nine Only"),
        ("1000", "Rupees One Thousand Only"),
        ("99999", "Rupees Ninety Nine Thousand Nine Hundred Ninety Nine Only"),
        ("100000", "Rupees One Lakh Only"),
        ("120000", "Rupees One Lakh Twenty Thousand Only"),
        ("9999999", "Rupees Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Only"),
        ("10000000", "Rupees One Crore Only"),
        (
            "123456789",
            "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only",
        ),
        ("1234.56", "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only"),
        (
            "99999.99",
            "Rupees Ninety Nine Thousand Nine Hundred Ninety Nine and Ninety Nine Paise Only",
        ),
        (
            "1234567890.99",
            "Rupees One Hundred Twenty Three Crore Forty Five Lakh Sixty Seven Thousand Eight Hundred Ninety and Ninety Nine Paise Only",
        ),
    ],
)
def test_to_indian_words(amount, words):
    assert to_indian_words(Decimal(amount)) == words


def test_receipt_number_format():
    assert receipt_number(SimpleNamespace(received_on=date(2026, 9, 25), pk=7)) == "RC-2026-000007"
    assert (
        receipt_number(SimpleNamespace(received_on=date(2027, 1, 1), pk=123456)) == "RC-2027-123456"
    )
    assert (
        receipt_number(SimpleNamespace(received_on=date(2027, 1, 1), pk=1234567))
        == "RC-2027-1234567"
    )


@pytest.mark.parametrize(
    "amount, text",
    [
        ("0", "₹0.00"),
        ("999", "₹999.00"),
        ("1000", "₹1,000.00"),
        ("120000", "₹1,20,000.00"),
        ("1234567.5", "₹12,34,567.50"),
        ("-5000", "-₹5,000.00"),
    ],
)
def test_format_inr(amount, text):
    assert format_inr(Decimal(amount)) == text


def test_csv_safe_prefixes_formulas():
    for bad in ("=1+1", "+1", "-1", "@SUM(A1)", "\tx"):
        assert csv_safe(bad) == "'" + bad
    assert csv_safe("fine") == "fine" and csv_safe(None) == ""
