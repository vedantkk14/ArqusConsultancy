"""Demo projects and expenses for seed_demo_data. Deterministic and idempotent (keyed by lead)."""

import io
import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.utils import timezone
from PIL import Image, ImageDraw

from . import integrations, selectors, services
from .models import Expense, ExpenseCategory, Project, ProjectStatus

PM2 = ("pm.anita", "Anita", "Kulkarni", "anita.pm@crm.local")

# Extra won deals so there are 10 in total: 8 become projects and 2 stay convertible for demos.
EXTRA_WON = [
    ("Nagar Road Turf Club", 420000),
    ("Bavdhan Sports Arena", 560000),
    ("Kondhwa Cricket Nets", 310000),
    ("Hadapsar Futsal Park", 480000),
]

#: Demo expenses are sized as a share of this % of the deal total, so they look realistic.
SPEND_BASE_PCT = Decimal("0.6")

# (pm, expenses as % of SPEND_BASE_PCT of the deal total, status, expense count)
# pm: 1 or 2 or None.
PLAN = [
    (1, 85, "RUNNING", 7),
    (1, 100, "RUNNING", 6),
    (2, 105, "RUNNING", 7),
    (None, 0, "RUNNING", 0),
    (2, 40, "RUNNING", 6),
    (1, 92, "COMPLETED", 6),
    (2, 60, "COMPLETED", 5),
    (2, 75, "COMPLETED", 5),
]
VENDORS = ["Shree Traders", "Om Hardware", "Patil Transport", "Sai Equipments", "Kale & Sons"]
NOTES = ["Sand and gravel", "Turf rolls", "Site labour, week 2", "Tempo hire", "Floodlight poles"]


def _receipt_png(label: str) -> bytes:
    image = Image.new("RGB", (360, 220), (248, 246, 240))
    draw = ImageDraw.Draw(image)
    draw.rectangle((10, 10, 349, 209), outline=(120, 120, 120))
    draw.text((24, 24), "DEMO RECEIPT", fill=(40, 40, 40))
    draw.text((24, 60), label, fill=(70, 70, 70))
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def _split(total: Decimal, count: int, rnd: random.Random) -> list[Decimal]:
    """`count` positive amounts that add up to exactly `total`."""
    weights = [rnd.uniform(0.6, 1.6) for _ in range(count)]
    parts = [(total * Decimal(str(w / sum(weights)))).quantize(Decimal("0.01")) for w in weights]
    parts[-1] = total - sum(parts[:-1])
    return parts


def _ensure_won_leads(admin):
    lead_model = integrations.lead_model()
    for i, (name, amount) in enumerate(EXTRA_WON):
        phone = f"+9196{i:08d}"
        if lead_model.all_objects.filter(phone=phone).exists():
            continue
        lead_model.objects.create(
            name=name,
            phone=phone,
            status="WON",
            source="REFERRAL",
            proposed_amount=amount,
            won_at=timezone.now() - timedelta(days=12 + i * 5),
            created_by=admin,
            assigned_to=None,
        )


def seed_projects(command, users) -> None:
    User = get_user_model()
    admin = users["ADMIN"]
    pm1 = users["PROJECT_MANAGER"]
    username, first, last, email = PM2
    pm2, created = User.objects.get_or_create(
        username=username,
        defaults={
            "first_name": first,
            "last_name": last,
            "email": email,
            "role": "PROJECT_MANAGER",
        },
    )
    if created:
        pm2.set_password("Project@123")
        pm2.save()
    command.stdout.write(
        f"  {'created' if created else 'found'} {username} (PROJECT_MANAGER, password Project@123)"
    )
    pms = {1: pm1, 2: pm2, None: None}

    _ensure_won_leads(admin)
    leads = list(integrations.lead_model().objects.filter(status="WON").order_by("id")[: len(PLAN)])
    rnd = random.Random(7)
    now = timezone.now()
    made = 0
    for lead, (pm_key, usage, status, count) in zip(leads, PLAN, strict=False):
        if Project.objects.filter(lead=lead).exists():
            continue
        total = lead.proposed_amount or Decimal("400000")
        base = (Decimal(total) * SPEND_BASE_PCT).quantize(Decimal("1"))
        project = services.convert(
            lead.pk,
            name=f"{lead.name}: ground works",
            pm_id=pms[pm_key].pk if pms[pm_key] else None,
            start_date=(now - timedelta(days=80)).date(),
            expected_end_date=(now + timedelta(days=40)).date(),
            scope="Site preparation, turf laying, drainage and floodlighting.",
            by=admin,
        )
        started = now - timedelta(days=rnd.randint(70, 88))
        Project.objects.filter(pk=project.pk).update(created_at=started)
        if count:
            _seed_expenses(project, pms[pm_key] or admin, admin, base, usage, count, rnd)
        if status == "COMPLETED":
            Project.objects.filter(pk=project.pk).update(
                status=ProjectStatus.COMPLETED,
                completed_at=now - timedelta(days=rnd.randint(2, 20)),
                completed_by=pms[pm_key] or admin,
            )
        made += 1
    total_expenses = Expense.objects.count()
    command.stdout.write(
        f"  projects: {made} created ({Project.objects.count()} in total), "
        f"{total_expenses} expenses"
    )


def _seed_expenses(project, logger, admin, base, usage, count, rnd) -> None:
    now = timezone.now()
    target = (base * Decimal(usage) / 100).quantize(Decimal("0.01"))
    amounts = _split(target, count, rnd)
    categories = list(ExpenseCategory.values)
    for n, amount in enumerate(amounts):
        category = categories[(n + project.pk) % len(categories)]
        day = (now - timedelta(days=rnd.randint(1, 85))).date()
        expense = Expense(
            project=project,
            amount=amount,
            category=category,
            spent_on=day,
            vendor=VENDORS[n % len(VENDORS)],
            description=NOTES[n % len(NOTES)],
            logged_by=admin if n == count - 1 and n % 2 else logger,
        )
        if category != "LABOUR" and n % 3 != 2:
            expense.receipt.save(
                "receipt.png", ContentFile(_receipt_png(f"{category} {amount}")), save=False
            )
            expense.receipt_kind, expense.receipt_type = "image", "image/png"
        expense.save()
        Expense.objects.filter(pk=expense.pk).update(
            created_at=now - timedelta(days=(now.date() - day).days, hours=2)
        )
    # A couple of voided expenses (not counted in the usage above).
    if usage and count > 5:
        for extra in range(2):
            Expense.objects.create(
                project=project,
                amount=Decimal("1500.00") * (extra + 1),
                category="OTHER",
                spent_on=(now - timedelta(days=10 + extra)).date(),
                vendor="Wrong entry",
                description="Entered twice",
                logged_by=logger,
                is_void=True,
                void_reason="Duplicate entry.",
                voided_at=now - timedelta(days=9),
                voided_by=admin,
            )


# A small set for one PM: (client, project, deal total, spend %, status)
FLOW_DEMO = [
    ("Rajesh Sharma", "Sharma Farmhouse Turf", 500000, 45, "RUNNING"),
    ("Anjali Iyer", "Iyer Residency Lawn", 400000, 85, "RUNNING"),
    ("Vikram Singh Rathore", "Rathore Cricket Academy Nets", 800000, 104, "RUNNING"),
    ("Sunita Deshmukh", "Deshmukh Society Play Area", 300000, 92, "COMPLETED"),
]


def seed_pm_flow(command, users, pm_username: str = "project_manager") -> None:
    """Four projects with Indian client names for one PM, three running and one completed."""
    from apps.accounts.models import Ledger

    pm = get_user_model().objects.filter(username=pm_username, role="PROJECT_MANAGER").first()
    if pm is None:
        command.stdout.write(f"  pm flow: no project manager '{pm_username}', skipped")
        return
    admin = users["ADMIN"]
    lead_model = integrations.lead_model()
    rnd = random.Random(11)
    now = timezone.now()
    made = 0
    for i, (client, name, total, usage, status) in enumerate(FLOW_DEMO):
        phone = f"+9195{pm.pk:04d}{i:04d}"  # one set per PM
        if Project.objects.filter(pm=pm, name=name).exists():
            continue
        lead = lead_model.objects.create(
            name=client,
            phone=phone,
            email=f"{client.split()[0].lower()}@example.in",
            status="WON",
            source="REFERRAL",
            proposed_amount=total,
            won_at=now - timedelta(days=30 + i),
            created_by=admin,
            assigned_to=None,
        )
        Ledger.objects.create(
            lead=lead,
            total_amount=total,
            finalized_at=now - timedelta(days=28),
            finalized_on=selectors.business_today(),
            finalized_by=admin,
        )
        base = (Decimal(total) * SPEND_BASE_PCT).quantize(Decimal("1"))
        project = services.convert(
            lead.pk,
            name=name,
            pm_id=pm.pk,
            start_date=(now - timedelta(days=25)).date(),
            expected_end_date=(now + timedelta(days=45)).date(),
            scope="Site preparation, turf laying and finishing.",
            by=admin,
        )
        _seed_expenses(project, pm, admin, base, usage, 5, rnd)
        if status == "COMPLETED":
            Project.objects.filter(pk=project.pk).update(
                status=ProjectStatus.COMPLETED,
                completed_at=now - timedelta(days=2),
                completed_by=pm,
            )
        made += 1
    command.stdout.write(f"  pm flow: {made} projects created for {pm_username}")
