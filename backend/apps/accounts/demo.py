# ruff: noqa: E501
"""Demo ledgers and payments for seed_demo_data. Deterministic and idempotent (keyed by lead phone)."""

import io
from datetime import timedelta
from decimal import Decimal

from django.core.files.base import ContentFile
from django.utils import timezone
from PIL import Image, ImageDraw

from apps.leads.models import Lead

from . import selectors, services
from .models import Ledger, LedgerEvent, LedgerEventType, Payment

# Won deals that have no project: two of them stay awaiting finalization.
ACCOUNTS_WON = [
    ("Awaiting Sports Village", "+9195000000000", 350000),
    ("Bibwewadi Multi-sport Arena", "+9195000000001", 275000),
]

# Per won lead, in order of id: (days since finalization or None for "awaiting", payments).
# A payment is (days ago, % of the total, mode, has proof, void). Together they cover every ledger
# state and every aging bucket (0-30, 31-60, 61-90 and 90+).
PLAN = [
    (150, [(140, 50, "BANK_TRANSFER", True, False), (60, 50, "UPI", False, False)]),  # PAID
    (
        170,
        [
            (160, 40, "CHEQUE", True, False),
            (90, 30, "CASH", False, False),
            (20, 30, "CARD", False, False),
            (19, 10, "CASH", False, True),
        ],
    ),  # PAID, one voided
    (60, [(58, 30, "BANK_TRANSFER", False, False), (4, 30, "UPI", True, False)]),  # PARTIAL, recent
    (
        100,
        [(95, 30, "UPI", False, False), (50, 10, "OTHER", False, True)],
    ),  # PARTIAL, 90+ ... voided one ignored
    (75, []),  # UNPAID, 61-90
    (200, [(120, 20, "BANK_TRANSFER", True, False)]),  # PARTIAL, 90+
    (10, []),  # UNPAID, 0-30
    (
        90,
        [(85, 25, "CHEQUE", False, False), (44, 25, "BANK_TRANSFER", False, False)],
    ),  # PARTIAL, 31-60
    (3, []),  # UNPAID, finalized, no project yet (convertible)
    (None, []),  # awaiting finalization
    (None, []),  # awaiting finalization
    (30, [(28, 100, "BANK_TRANSFER", True, False)]),  # PAID
]
MODES_REF = {
    "CASH": "",
    "BANK_TRANSFER": "UTR{n:09d}",
    "UPI": "UPI{n:08d}",
    "CHEQUE": "CHQ {n:06d}",
    "CARD": "CARD-{n:06d}",
    "OTHER": "REF-{n:05d}",
}


def _proof_png(label: str) -> bytes:
    image = Image.new("RGB", (360, 220), (245, 248, 250))
    draw = ImageDraw.Draw(image)
    draw.rectangle((10, 10, 349, 209), outline=(120, 120, 120))
    draw.text((24, 24), "DEMO PAYMENT PROOF", fill=(40, 40, 40))
    draw.text((24, 60), label, fill=(70, 70, 70))
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def _won_leads(admin):
    from apps.projects.demo import _ensure_won_leads

    _ensure_won_leads(
        admin
    )  # projects' own extra won deals: their ledgers must be finalized before converting
    for name, phone, amount in ACCOUNTS_WON:
        if not Lead.all_objects.filter(phone=phone).exists():
            Lead.objects.create(
                name=name,
                phone=phone,
                status="WON",
                source="REFERRAL",
                proposed_amount=amount,
                won_at=timezone.now() - timedelta(days=40),
                created_by=admin,
            )
    return list(Lead.objects.filter(status="WON").order_by("id"))


def seed_ledgers(command, users) -> None:
    admin = users["ADMIN"]
    leads = _won_leads(admin)
    now = timezone.now()
    finalized = 0
    for i, lead in enumerate(leads):
        ledger = services.create_ledger(lead)
        plan = PLAN[i] if i < len(PLAN) else (None, [])
        days = plan[0]
        if days is None or ledger.finalized_at:
            continue
        proposed = lead.proposed_amount or Decimal("300000")
        # Never below the project budget (60% of the proposed amount), so projects stay consistent.
        total = (Decimal(proposed) * (Decimal("1.10") if i % 2 else Decimal("1.00"))).quantize(
            Decimal("1")
        )
        moment = now - timedelta(days=days)
        Ledger.objects.filter(pk=ledger.pk).update(
            total_amount=total,
            finalized_at=moment,
            finalized_on=selectors.business_date(moment),
            finalized_by=admin,
            finalize_note="Agreed with the client.",
        )
        Ledger.objects.filter(pk=ledger.pk).update(created_at=moment - timedelta(days=2))
        LedgerEvent.objects.create(
            ledger=ledger,
            type=LedgerEventType.FINALIZED,
            actor=admin,
            data={"amount": f"{total:.2f}", "note": "Agreed with the client."},
        )
        finalized += 1
    command.stdout.write(
        f"  ledgers: {len(leads)} won deals, {finalized} finalized now, {Ledger.objects.filter(finalized_at__isnull=True).count()} awaiting finalization"
    )


def seed_payments(command, users) -> None:
    admin = users["ADMIN"]
    now = timezone.now()
    made = 0
    for i, lead in enumerate(Lead.objects.filter(status="WON").order_by("id")):
        ledger = Ledger.objects.filter(lead=lead).first()
        if ledger is None or not ledger.finalized_at or ledger.payments.exists() or i >= len(PLAN):
            continue
        for n, (days, pct, mode, proof, void) in enumerate(PLAN[i][1]):
            amount = (ledger.total_amount * pct / 100).quantize(Decimal("0.01"))
            when = now - timedelta(days=days)
            payment = Payment(
                ledger=ledger,
                amount=amount,
                mode=mode,
                reference=MODES_REF[mode].format(n=i * 100 + n + 1),
                received_on=selectors.business_date(when),
                note="Advance" if n == 0 else "",
                recorded_by=admin,
                is_void=void,
                void_reason="Entered twice." if void else "",
                voided_at=now - timedelta(days=max(days - 1, 0)) if void else None,
                voided_by=admin if void else None,
            )
            if proof:
                payment.proof.save(
                    "proof.png", ContentFile(_proof_png(f"{lead.name} {amount}")), save=False
                )
                payment.proof_kind, payment.proof_type = "image", "image/png"
            payment.save()
            Payment.objects.filter(pk=payment.pk).update(created_at=when)
            LedgerEvent.objects.create(
                ledger=ledger,
                type=LedgerEventType.PAYMENT_ADDED,
                actor=admin,
                data={"payment_id": payment.pk, "amount": f"{amount:.2f}", "mode": mode},
            )
            made += 1
    command.stdout.write(f"  payments: {made} created ({Payment.objects.count()} in total)")
