import io
import os
import re

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.projects import receipts, rules
from apps.projects.models import Expense

from .conftest import BASE, EXPENSES, expense_form, png_bytes, receipt_file


def add(client, project, **over):
    return client.post(f"{BASE}/{project.pk}/expenses", expense_form(**over), format="multipart")


def fake(name, data, content_type):
    return SimpleUploadedFile(name, data, content_type=content_type)


def test_a_fake_extension_with_wrong_magic_bytes_is_rejected(client_for, pm1, project):
    res = add(
        client_for(pm1),
        project,
        receipt=fake("receipt.png", b"MZ\x90\x00 not an image", "image/png"),
    )
    assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_receipt"
    assert not Expense.objects.exists()


def test_the_client_content_type_is_not_trusted(client_for, pm1, project):
    # A real PNG sent as text/plain is fine; a script sent as image/png is not.
    ok = add(client_for(pm1), project, receipt=fake("r.bin", png_bytes(), "text/plain"))
    assert ok.status_code == 201 and ok.json()["receipt_type"] == "image/png"
    bad = add(
        client_for(pm1), project, receipt=fake("r.png", b"<script>alert(1)</script>", "image/png")
    )
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_receipt"


def test_oversize_receipts_are_rejected(client_for, pm1, project):
    big = b"%PDF-1.4\n" + b"0" * (rules.MAX_RECEIPT_BYTES + 1)
    res = add(client_for(pm1), project, receipt=fake("r.pdf", big, "application/pdf"))
    assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_receipt"
    at_limit = b"%PDF-1.4\n" + b"0" * (rules.MAX_RECEIPT_BYTES - 9)
    assert (
        add(
            client_for(pm1), project, receipt=fake("r.pdf", at_limit, "application/pdf")
        ).status_code
        == 201
    )


@pytest.mark.parametrize("name, data, kind, mime", [
    ("a.jpg", None, "image", "image/jpeg"),
    ("a.png", png_bytes(), "image", "image/png"),
    ("a.pdf", b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "pdf", "application/pdf"),
])  # fmt: skip
def test_allowed_types_are_detected_by_their_bytes(
    client_for, pm1, project, name, data, kind, mime
):
    if data is None:
        buf = io.BytesIO()
        Image.new("RGB", (10, 10)).save(buf, "JPEG")
        data = buf.getvalue()
    res = add(client_for(pm1), project, receipt=fake(name, data, "application/octet-stream"))
    assert res.status_code == 201, res.content
    assert (res.json()["receipt_kind"], res.json()["receipt_type"]) == (kind, mime)


def test_webp_is_accepted(client_for, pm1, project):
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, "WEBP")
    res = add(client_for(pm1), project, receipt=fake("r.webp", buf.getvalue(), "image/webp"))
    assert res.status_code == 201 and res.json()["receipt_type"] == "image/webp"


def test_exif_is_stripped_and_large_images_are_resized():
    upload = receipt_file("big.jpg", _jpeg(size=(3200, 1600), exif=True), "image/jpeg")
    processed = receipts.process(upload)
    image = Image.open(io.BytesIO(processed.data))
    assert max(image.size) == rules.RECEIPT_MAX_SIDE == 1600
    assert image.size == (1600, 800)  # aspect ratio kept
    assert not image.getexif() and b"SecretCamera" not in processed.data


def test_small_images_are_not_upscaled():
    processed = receipts.process(receipt_file("s.png", png_bytes((64, 48))))
    assert Image.open(io.BytesIO(processed.data)).size == (64, 48)


def test_a_corrupt_image_with_a_valid_header_is_rejected(client_for, pm1, project):
    res = add(
        client_for(pm1),
        project,
        receipt=fake("r.png", b"\x89PNG\r\n\x1a\n" + b"garbage" * 5, "image/png"),
    )
    assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_receipt"


def test_receipts_are_stored_privately_under_a_uuid_path(client_for, pm1, project, settings):
    res = add(client_for(pm1), project)
    expense = Expense.objects.get(pk=res.json()["id"])
    assert re.fullmatch(rf"receipts/{project.pk}/[0-9a-f]{{32}}\.png", expense.receipt.name)
    assert os.path.exists(os.path.join(settings.MEDIA_ROOT, expense.receipt.name))
    with pytest.raises(ValueError):
        expense.receipt.url  # noqa: B018 - there is no public URL


def test_no_response_ever_carries_a_media_url(client_for, pm1, admin, project, make_expense):
    make_expense(pm1, "10.00")
    for user in (pm1, admin):
        c = client_for(user)
        for url in (f"{BASE}/{project.pk}/expenses", EXPENSES, f"{BASE}/{project.pk}"):
            body = c.get(url).content.decode()
            assert "/media/" not in body and "receipts/" not in body


# ---- Serving -----------------------------------------------------------------------------------


def test_the_receipt_endpoint_serves_the_file_with_safe_headers(
    client_for, pm1, admin, make_expense
):
    expense = make_expense(pm1, "10.00")
    for user in (pm1, admin):
        res = client_for(user).get(f"{EXPENSES}/{expense.pk}/receipt")
        assert res.status_code == 200
        assert res["Content-Type"] == "image/png"
        assert res["X-Content-Type-Options"] == "nosniff"
        assert res["Content-Disposition"].startswith("inline;")
        assert res["Cache-Control"] == "private, no-store"
        assert b"".join(res.streaming_content)[:8] == b"\x89PNG\r\n\x1a\n"


def test_the_receipt_endpoint_is_authorized(
    client_for, pm1, pm2, sales_manager, sales_exec, make_expense
):
    expense = make_expense(pm1, "10.00")
    url = f"{EXPENSES}/{expense.pk}/receipt"
    assert client_for().get(url).status_code == 401
    assert (
        client_for(pm2).get(url).status_code == 404
    )  # another PM's receipt does not exist for them
    assert client_for(sales_manager).get(url).status_code == 403
    assert client_for(sales_exec).get(url).status_code == 403


def test_an_expense_without_a_receipt_answers_404(client_for, admin, make_expense):
    expense = make_expense(admin, "10.00", category="LABOUR")
    assert client_for(admin).get(f"{EXPENSES}/{expense.pk}/receipt").status_code == 404


def test_a_pdf_is_served_as_a_pdf(client_for, pm1, project):
    res = add(client_for(pm1), project, receipt=fake("r.pdf", b"%PDF-1.4\nbody", "application/pdf"))
    served = client_for(pm1).get(f"{EXPENSES}/{res.json()['id']}/receipt")
    assert served["Content-Type"] == "application/pdf" and served["Content-Disposition"].endswith(
        '.pdf"'
    )


def test_a_failed_expense_leaves_no_orphan_file(client_for, pm1, make_project, settings):
    project = make_project(pm=pm1, budget="1.00")
    res = add(
        client_for(pm1), project, amount="500.00"
    )  # over budget: refused after the file was processed
    assert res.status_code == 409
    files = (
        [f for _, _, names in os.walk(settings.MEDIA_ROOT) for f in names]
        if os.path.exists(settings.MEDIA_ROOT)
        else []
    )
    assert files == []


def _jpeg(size, exif):
    image = Image.new("RGB", size, (10, 120, 200))
    out = io.BytesIO()
    data = Image.Exif()
    data[0x010F] = "SecretCamera"
    image.save(out, "JPEG", exif=data if exif else None)
    return out.getvalue()
