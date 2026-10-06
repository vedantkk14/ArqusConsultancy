from datetime import date
from decimal import Decimal

from apps.invoices import calc


def test_indian_grouping():
    assert calc.indian("3163860.17") == "31,63,860.17"
    assert calc.indian(3733355) == "37,33,355.00"
    assert calc.indian("999") == "999.00"
    assert calc.indian("1000") == "1,000.00"
    assert calc.indian("12345678.5") == "1,23,45,678.50"
    assert calc.indian("-1500") == "-1,500.00"


def test_amount_in_words_like_the_sample_invoice():
    assert calc.in_words(3733355) == (
        "Thirty Seven Lakh Thirty Three Thousand Three Hundred And Fifty Five"
    )
    assert calc.in_words(100000) == "One Lakh"
    assert calc.in_words(105000) == "One Lakh Five Thousand"
    assert calc.in_words(21500000) == "Two Crore Fifteen Lakh"
    assert calc.in_words(105) == "One Hundred And Five"
    assert calc.in_words(1000) == "One Thousand"
    assert calc.in_words(0) == "Zero"


def test_the_date_reads_like_the_sample():
    assert calc.ordinal_date(date(2026, 8, 24)) == "24th August 2026"
    assert calc.ordinal_date(date(2026, 8, 1)) == "1st August 2026"
    assert calc.ordinal_date(date(2026, 8, 2)) == "2nd August 2026"
    assert calc.ordinal_date(date(2026, 8, 3)) == "3rd August 2026"
    assert calc.ordinal_date(date(2026, 8, 11)) == "11th August 2026"


def test_totals_with_igst_and_rounding_to_the_rupee():
    f = calc.compute([("8304.09", "381.00")], "18", "IGST")
    assert f["amounts"] == [Decimal("3163858.29")]
    assert f["tax"] == Decimal("569494.49")
    assert f["round_off"] == Decimal("0.22")
    assert f["total"] == Decimal("3733353.00")
    assert f["cgst"] == f["sgst"] == Decimal("0.00")


def test_cgst_sgst_split_the_tax_and_the_odd_paisa_goes_to_sgst():
    f = calc.compute([("1", "100.05")], "5", "CGST_SGST")  # tax 5.0025 -> 5.00? use a clean one
    assert f["cgst"] + f["sgst"] == f["tax"]
    odd = calc.compute([("1", "0.30")], "5", "CGST_SGST")  # 0.015 -> 0.02
    assert odd["cgst"] + odd["sgst"] == odd["tax"] == Decimal("0.02")
    assert odd["cgst"] == Decimal("0.01") and odd["sgst"] == Decimal("0.01")


def test_blank_gst_means_no_tax_and_many_lines_add_up():
    f = calc.compute([("2", "10.50"), ("3", "4.25")], None, "IGST")
    assert f["subtotal"] == Decimal("33.75") and f["tax"] == Decimal("0.00")
    assert f["total"] == Decimal("34.00") and f["round_off"] == Decimal("0.25")
    zero = calc.compute([("1", "1000")], "0", "IGST")
    assert zero["tax"] == Decimal("0.00") and zero["total"] == Decimal("1000.00")
