import pytest

from apps.leads.utils import InvalidPhone, csv_safe, normalize_phone


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("9876543210", "+919876543210"),
        ("98765 43210", "+919876543210"),
        ("098765-43210", "+919876543210"),
        ("+91 98765 43210", "+919876543210"),
        ("919876543210", "+919876543210"),
        ("(+91) 98765-43210", "+919876543210"),
        ("+44 20 7946 0958", "+442079460958"),
        ("+1 415 555 2671", "+14155552671"),
    ],
)
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "12345", "5876543210", "442079460958", "+1234567", "abc"])
def test_normalize_phone_rejects(raw):
    with pytest.raises(InvalidPhone):
        normalize_phone(raw)


def test_csv_safe():
    assert csv_safe("=SUM(A1)") == "'=SUM(A1)"
    assert csv_safe("+91") == "'+91"
    assert csv_safe("-1") == "'-1"
    assert csv_safe("@x") == "'@x"
    assert csv_safe("Rahul") == "Rahul"
    assert csv_safe(None) == ""
