# ruff: noqa: E501
import io
import os
import re
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image

from apps.accounts import proofs, rules, selectors, services
from apps.accounts.models import LedgerEvent, Payment

from .conftest import LEDGERS, PAYMENTS, payment_form, png_bytes, proof_file


def add(client, ledger, **over):
    return client.post(f"{LEDGERS}/{ledger.pk}/payments", payment_form(**over), format="multipart")


def code(res):
    return res.json()["error"]["code"]


def kinds(notes):
    return [(uid, kind) for uid, kind, _ in notes]


# ---- Basics ----------------------------------------------------------------------------------------


def test_record_a_payment_and_see_the_state_move(client_for, admin, admin2, ledger, notes):
    client = client_for(admin)
    res = add(client, ledger, amount="30000.00")
    assert res.status_code == 201, res.content
    body = res.json()
    assert (
        body["amount"] == "30000.00"
        and body["receipt_no"].startswith("RC-")
        and body["is_void"] is False
    )
    assert (
        body["balance_after"] == "70000.00"
        and body["amount_in_words"] == "Rupees Thirty Thousand Only"
    )
    detail = client.get(f"{LEDGERS}/{ledger.pk}").json()
    assert (
        detail["state"] == "PARTIAL"
        and detail["received"] == "30000.00"
        and detail["outstanding"] == "70000.00"
    )
    assert detail["collected_pct"] == "30.0"
    assert (admin2.pk, "payment_received") in kinds(notes) and (
        admin.pk,
        "payment_received",
    ) not in kinds(notes)
    assert LedgerEvent.objects.filter(ledger=ledger, type="PAYMENT_ADDED").count() == 1


def test_a_payment_of_exactly_the_outstanding_marks_the_ledger_paid(client_for, admin, ledger):
    client = client_for(admin)
    add(client, ledger, amount="99999.99")
    res = add(client, ledger, amount="0.01", reference="UTR2")
    assert res.status_code == 201
    detail = client.get(f"{LEDGERS}/{ledger.pk}").json()
    assert (
        detail["state"] == "PAID"
        and detail["outstanding"] == "0.00"
        and detail["collected_pct"] == "100.0"
    )
    assert "record_payment" not in detail["allowed_actions"]


def test_payments_need_a_finalized_ledger(client_for, admin, make_ledger):
    ledger = make_ledger(finalize=False)
    res = add(client_for(admin), ledger)
    assert res.status_code == 409 and code(res) == "not_finalized"
    assert not Payment.objects.exists()


def test_receipt_number_format_on_the_api(client_for, admin, ledger):
    body = add(client_for(admin), ledger).json()
    assert re.fullmatch(rf"RC-{selectors.business_today().year}-\d{{6}}", body["receipt_no"])
    assert body["receipt_no"].endswith(f"{body['id']:06d}")


# ---- Amount, mode, reference, date -----------------------------------------------------------------


@pytest.mark.parametrize(
    "amount", ["0", "0.00", "-1", "-0.01", "1.234", "12345678901", "abc", "1e3", "", "1,000"]
)
def test_amount_validation_rejects(client_for, admin, ledger, amount):
    res = add(client_for(admin), ledger, amount=amount)
    assert res.status_code == 400 and "amount" in res.json()["error"]["details"], amount


def test_amount_rejects_json_floats_but_takes_strings(client_for, admin, ledger):
    client = client_for(admin)
    body = {"mode": "CASH", "received_on": selectors.business_today().isoformat()}
    assert (
        client.post(
            f"{LEDGERS}/{ledger.pk}/payments", {**body, "amount": 12.5}, format="json"
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"{LEDGERS}/{ledger.pk}/payments", {**body, "amount": "12.50"}, format="json"
        ).status_code
        == 201
    )


@pytest.mark.parametrize("mode", ["BANK_TRANSFER", "UPI", "CHEQUE", "CARD", "OTHER"])
def test_reference_is_required_for_every_mode_except_cash(client_for, admin, ledger, mode):
    res = add(client_for(admin), ledger, mode=mode, reference=None)
    assert res.status_code == 400 and "reference" in res.json()["error"]["details"]
    blank = add(client_for(admin), ledger, mode=mode, reference="   ")
    assert blank.status_code == 400
    assert (
        add(client_for(admin), ledger, mode=mode, reference="REF1", amount="1").status_code == 201
    )


def test_cash_needs_no_reference_and_unknown_modes_are_refused(client_for, admin, ledger):
    assert (
        add(client_for(admin), ledger, mode="CASH", reference=None, amount="5").status_code == 201
    )
    assert add(client_for(admin), ledger, mode="BITCOIN").status_code == 400


def test_date_rules(client_for, admin, ledger):
    client = client_for(admin)
    today = selectors.business_today()
    assert add(client, ledger, received_on=today.isoformat(), amount="1").status_code == 201
    assert (
        add(
            client,
            ledger,
            received_on=(today - timedelta(days=90)).isoformat(),
            amount="1",
            reference="R2",
        ).status_code
        == 201
    )
    for bad in (today + timedelta(days=1), today - timedelta(days=91), "2026-13-45", "nope"):
        res = add(client, ledger, received_on=str(bad))
        assert res.status_code == 400 and "received_on" in res.json()["error"]["details"], bad


def test_note_is_limited_to_300_characters(client_for, admin, ledger):
    assert add(client_for(admin), ledger, note="x" * 300, amount="1").status_code == 201
    assert (
        add(client_for(admin), ledger, note="x" * 301, amount="2", reference="R2").status_code
        == 400
    )


# ---- Overpayment and duplicates --------------------------------------------------------------------


def test_overpayment_is_blocked_with_the_outstanding_amount(
    client_for, admin, ledger, make_payment
):
    make_payment(ledger, "90000.00")
    res = add(client_for(admin), ledger, amount="10000.01")
    assert res.status_code == 409 and code(res) == "overpayment"
    assert res.json()["error"]["details"] == {"outstanding": "10000.00"}
    assert Payment.objects.count() == 1


def test_two_sequential_payments_that_together_exceed_the_total_block_the_second(
    client_for, admin, ledger
):
    client = client_for(admin)
    assert add(client, ledger, amount="60000.00").status_code == 201
    assert code(add(client, ledger, amount="60000.00", reference="UTR-B")) == "overpayment"


def test_there_is_no_way_to_override_an_overpayment(client_for, admin, ledger):
    res = add(
        client_for(admin),
        ledger,
        amount="999999.00",
        confirm_duplicate="true",
        admin_override="true",
    )
    assert res.status_code == 409 and code(res) == "overpayment"


def test_duplicate_payment_needs_confirmation(client_for, admin, ledger):
    client = client_for(admin)
    assert add(client, ledger, amount="1000.00", reference="UTR1").status_code == 201
    dup = add(client, ledger, amount="1000.00", reference="UTR1")
    assert dup.status_code == 409 and code(dup) == "duplicate_payment"
    assert Payment.objects.count() == 1
    assert (
        add(
            client, ledger, amount="1000.00", reference="UTR1", confirm_duplicate="true"
        ).status_code
        == 201
    )
    assert Payment.objects.count() == 2
    # a different reference, amount, mode or date is not a duplicate
    assert add(client, ledger, amount="1000.00", reference="UTR9").status_code == 201
    assert add(client, ledger, amount="1001.00", reference="UTR1").status_code == 201


def test_duplicate_window_is_60_seconds_and_voided_twins_do_not_count(
    client_for, admin, ledger, make_payment
):
    first = make_payment(ledger, "500.00", reference="X1")
    old = timezone.now() - timedelta(seconds=rules.DUPLICATE_WINDOW_SECONDS + 5)
    Payment.objects.filter(pk=first.pk).update(created_at=old)
    second = add(client_for(admin), ledger, amount="500.00", reference="X1")
    assert second.status_code == 201  # the twin is older than the window
    assert (
        code(add(client_for(admin), ledger, amount="500.00", reference="X1")) == "duplicate_payment"
    )
    services.void_payment(second.json()["id"], admin, "typo")  # a voided twin no longer counts
    assert add(client_for(admin), ledger, amount="500.00", reference="X1").status_code == 201


# ---- Void ------------------------------------------------------------------------------------------


def test_void_needs_a_reason_and_restores_the_balance(
    client_for, admin, admin2, ledger, make_payment, notes
):
    payment = make_payment(ledger, "40000.00")
    client = client_for(admin)
    assert client.post(f"{PAYMENTS}/{payment.pk}/void", {}, format="json").status_code == 400
    assert (
        client.post(f"{PAYMENTS}/{payment.pk}/void", {"reason": ""}, format="json").status_code
        == 400
    )
    res = client.post(f"{PAYMENTS}/{payment.pk}/void", {"reason": "Cheque bounced"}, format="json")
    assert (
        res.status_code == 200
        and res.json()["is_void"] is True
        and res.json()["void_reason"] == "Cheque bounced"
    )
    detail = client.get(f"{LEDGERS}/{ledger.pk}").json()
    assert (
        detail["received"] == "0.00"
        and detail["outstanding"] == "100000.00"
        and detail["state"] == "UNPAID"
    )
    listed = client.get(f"{LEDGERS}/{ledger.pk}/payments").json()["results"]
    assert len(listed) == 1 and listed[0]["is_void"] is True  # stays visible
    assert (admin2.pk, "payment_voided") in kinds(notes) and (
        admin.pk,
        "payment_voided",
    ) not in kinds(notes)
    assert LedgerEvent.objects.filter(ledger=ledger, type="PAYMENT_VOIDED").count() == 1
    again = client.post(f"{PAYMENTS}/{payment.pk}/void", {"reason": "again"}, format="json")
    assert again.status_code == 409 and code(again) == "payment_void"
    assert Payment.objects.count() == 1  # never hard deleted


def test_void_works_at_any_age_and_frees_room_for_a_new_payment(
    client_for, admin, ledger, make_payment
):
    old = make_payment(ledger, "100000.00", days_ago=80)
    Payment.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=80))
    assert add(client_for(admin), ledger, amount="1.00").status_code == 409
    assert (
        client_for(admin)
        .post(f"{PAYMENTS}/{old.pk}/void", {"reason": "Wrong client"}, format="json")
        .status_code
        == 200
    )
    assert add(client_for(admin), ledger, amount="100000.00", reference="NEW").status_code == 201


# ---- Proof -----------------------------------------------------------------------------------------


def fake(name, data, content_type="application/octet-stream"):
    return SimpleUploadedFile(name, data, content_type=content_type)


def test_proof_wrong_magic_bytes_are_rejected_whatever_the_extension(client_for, admin, ledger):
    res = add(
        client_for(admin), ledger, proof=fake("slip.png", b"MZ\x90\x00 not an image", "image/png")
    )
    assert res.status_code == 400 and code(res) == "invalid_proof"
    assert not Payment.objects.exists()


def test_proof_content_type_from_the_client_is_not_trusted(client_for, admin, ledger):
    ok = add(client_for(admin), ledger, proof=fake("p.bin", png_bytes(), "text/plain"), amount="1")
    assert ok.status_code == 201 and ok.json()["proof_type"] == "image/png"


def test_oversize_proof_is_rejected(client_for, admin, ledger):
    big = b"%PDF-1.4\n" + b"0" * (rules.MAX_PROOF_BYTES + 1)
    res = add(client_for(admin), ledger, proof=fake("p.pdf", big, "application/pdf"))
    assert res.status_code == 400 and code(res) == "invalid_proof"


@pytest.mark.parametrize(
    "kind, mime", [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")]
)
def test_image_proofs_are_accepted(client_for, admin, ledger, kind, mime):
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, kind)
    res = add(client_for(admin), ledger, proof=fake("p", buf.getvalue()), amount="1")
    assert (
        res.status_code == 201
        and res.json()["proof_kind"] == "image"
        and res.json()["proof_type"] == mime
    )


def test_pdf_proof_is_stored_as_is(client_for, admin, ledger):
    res = add(client_for(admin), ledger, proof=fake("p.pdf", b"%PDF-1.7\nbody"), amount="1")
    assert (
        res.status_code == 201
        and res.json()["proof_kind"] == "pdf"
        and res.json()["proof_type"] == "application/pdf"
    )


def test_exif_is_stripped_and_large_images_are_resized():
    out = io.BytesIO()
    exif = Image.Exif()
    exif[0x010F] = "SecretCamera"
    Image.new("RGB", (3200, 1600), (10, 120, 200)).save(out, "JPEG", exif=exif)
    processed = proofs.process(fake("big.jpg", out.getvalue()))
    image = Image.open(io.BytesIO(processed.data))
    assert (
        image.size == (1600, 800) and not image.getexif() and b"SecretCamera" not in processed.data
    )
    small = proofs.process(proof_file())
    assert Image.open(io.BytesIO(small.data)).size == (64, 48)  # never upscaled


def test_proofs_are_stored_privately_under_a_uuid_path(client_for, admin, ledger, settings):
    res = add(client_for(admin), ledger, proof=proof_file())
    payment = Payment.objects.get(pk=res.json()["id"])
    assert re.fullmatch(rf"payment_proofs/{ledger.pk}/[0-9a-f]{{32}}\.png", payment.proof.name)
    assert os.path.exists(os.path.join(settings.MEDIA_ROOT, payment.proof.name))
    with pytest.raises(ValueError):
        payment.proof.url  # noqa: B018 - there is no public URL
    assert "/media/" not in res.content.decode() and "payment_proofs" not in res.content.decode()


def test_a_failed_payment_leaves_no_orphan_file(client_for, admin, ledger, settings):
    res = add(
        client_for(admin), ledger, amount="999999.00", proof=proof_file()
    )  # overpayment, after the file was processed
    assert res.status_code == 409
    files = (
        [f for _, _, names in os.walk(settings.MEDIA_ROOT) for f in names]
        if os.path.exists(settings.MEDIA_ROOT)
        else []
    )
    assert files == []


def test_the_proof_endpoint_serves_the_file_with_safe_headers(client_for, admin, ledger):
    pid = add(client_for(admin), ledger, proof=proof_file()).json()["id"]
    res = client_for(admin).get(f"{PAYMENTS}/{pid}/proof")
    assert res.status_code == 200 and res["Content-Type"] == "image/png"
    assert res["X-Content-Type-Options"] == "nosniff" and res["Content-Disposition"].startswith(
        "inline;"
    )
    assert (
        res["Cache-Control"] == "private, no-store"
        and b"".join(res.streaming_content)[:8] == b"\x89PNG\r\n\x1a\n"
    )


def test_the_proof_endpoint_is_authorized(
    client_for, sales_manager, sales_exec, pm, ledger, make_payment
):
    payment = make_payment(ledger, "10.00")
    url = f"{PAYMENTS}/{payment.pk}/proof"
    assert client_for().get(url).status_code == 401
    for user in (sales_manager, sales_exec, pm):
        assert client_for(user).get(url).status_code == 403


def test_a_payment_without_proof_answers_404(client_for, admin, ledger, make_payment):
    payment = make_payment(ledger, "10.00")
    assert client_for(admin).get(f"{PAYMENTS}/{payment.pk}/proof").status_code == 404
