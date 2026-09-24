"""Seed local demo data. Safe to re-run. Refuses to run unless DEBUG=True."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

# Known DEV-ONLY credentials. Documented in README.md.
DEMO_USERS = [
    # username, password, role, first name, last name, email
    ("admin", "Admin@123", "ADMIN", "Alice", "Admin", "admin@crm.local"),
    ("sales_manager", "Manager@123", "SALES_MANAGER", "Sam", "Manager", "sales.manager@crm.local"),
    ("sales_exec", "Exec@123", "SALES_EXEC", "Eva", "Exec", "sales.exec@crm.local"),
    ("project_manager", "Project@123", "PROJECT_MANAGER", "Paul", "Project", "pm@crm.local"),
]

# Forced password change on first sign-in (tests the must_change_password flow). Reset on every run.
FORCED_CHANGE_USER = (
    "newuser.demo",
    "Welcome@123",
    "SALES_EXEC",
    "Nina",
    "Newuser",
    "newuser@crm.local",
)


# Two more execs so lists, the leaderboard and reassignment have data. Password Exec@123.
EXTRA_EXECS = [("rohan.exec", "Rohan", "Mehta"), ("priya.exec", "Priya", "Nair")]

# name, status, follow-up bucket. Some names repeat on purpose (different people, same name).
DEMO_LEADS = [
    ("Rahul Sharma", "NEW", "none"),
    ("Pune Strikers FC", "NEW", "today"),
    ("Ananya Kulkarni", "NEW", "overdue"),
    ("Deccan Sports Academy", "CONTACTED", "overdue"),
    ("Nashik Cricket Club", "CONTACTED", "today"),
    ("Mumbai Arena Pvt Ltd", "INTERESTED", "upcoming"),
    ("Kolhapur Kabaddi League", "WON", "none"),
    ("Sneha Patil", "LOST", "none"),
    ("Rahul Sharma", "CONTACTED", "upcoming"),
    ("Vikram Desai", "INTERESTED", "overdue"),
    ("Goa Football Club", "NEW", "none"),
    ("Aarav Joshi", "CONTACTED", "none"),
    ("Satara Hockey Club", "INTERESTED", "today"),
    ("Priyanka Rao", "WON", "none"),
    ("Thane Tennis Academy", "LOST", "none"),
    ("Karan Mehta", "NEW", "upcoming"),
    ("Baner Badminton Hub", "CONTACTED", "overdue"),
    ("Meera Iyer", "INTERESTED", "upcoming"),
    ("Aurangabad Athletics", "WON", "none"),
    ("Rohit Pawar", "NEW", "none"),
    ("Solapur Sports Club", "CONTACTED", "upcoming"),
    ("Neha Gupta", "LOST", "none"),
    ("Kothrud Cricket Ground", "INTERESTED", "none"),
    ("Aditya Singh", "NEW", "overdue"),
    ("Sangli Swimming Club", "WON", "none"),
    ("Pooja Bhosale", "CONTACTED", "today"),
    ("Hinjewadi Sports Park", "INTERESTED", "overdue"),
    ("Siddharth Jain", "NEW", "none"),
    ("Latur Volleyball Club", "LOST", "none"),
    ("Isha Deshmukh", "CONTACTED", "upcoming"),
    ("Wakad Turf Arena", "WON", "none"),
    ("Aniket More", "NEW", "none"),
    ("Pimpri Chess Academy", "INTERESTED", "upcoming"),
    ("Tanvi Kale", "CONTACTED", "overdue"),
    ("Ratnagiri Rowing Club", "WON", "none"),
    ("Aniket More", "NEW", "upcoming"),
    ("Chinchwad Cycling Club", "LOST", "none"),
    ("Kavya Shetty", "INTERESTED", "today"),
    ("Nagpur Sports Complex", "CONTACTED", "none"),
    ("Omkar Salunkhe", "NEW", "none"),
]

REQUIREMENTS = [
    "New synthetic turf for a 5-a-side ground, with floodlights.",
    "Feasibility study for a multi-sport academy.",
    "Upgrade seating and changing rooms before the season.",
    "Consulting on a membership and booking system.",
    "",
]

NOTES = [
    "Discussed scope and timelines.",
    "Shared the brochure and past projects.",
    "Asked for a site visit next week.",
    "Waiting on budget approval from the committee.",
    "Sent a revised quote.",
    "Client prefers a call in the evening.",
]


class Command(BaseCommand):
    help = "Create demo users (one per role) and, later, demo business data. DEBUG only."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Refusing to seed demo data because DEBUG is False.")

        users = self._seed_users()
        self._seed_forced_change_user()
        self._seed_leads(users)
        self._seed_ledgers(users)  # before projects: converting a deal needs a finalized ledger
        self._seed_projects(users)
        self._seed_payments(users)
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self._print_credentials()

    def _seed_users(self):
        User = get_user_model()
        users = {}
        for username, password, role, first, last, email in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"first_name": first, "last_name": last, "email": email, "role": role},
            )
            user.role = role
            user.set_password(password)
            if role == "ADMIN":
                user.is_staff = user.is_superuser = True  # lets admin use /admin/
            user.save()
            users[role] = user
            self.stdout.write(f"  {'created' if created else 'updated'} {username} ({role})")
        return users

    def _seed_forced_change_user(self):
        from apps.users.services import set_temporary_password

        User = get_user_model()
        username, password, role, first, last, email = FORCED_CHANGE_USER
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"first_name": first, "last_name": last, "email": email, "role": role},
        )
        set_temporary_password(user, password)  # also sets must_change_password=True
        self.stdout.write(
            f"  {'created' if created else 'reset'} {username} (must change password)"
        )

    def _print_credentials(self):
        rows = [(u, p, r) for u, p, r, *_ in DEMO_USERS]
        forced_user, forced_password = FORCED_CHANGE_USER[:2]
        rows.append((forced_user, forced_password, "SALES_EXEC, must change password"))
        width = max(len(u) for u, _, _ in rows)
        self.stdout.write("")
        self.stdout.write("Demo logins (dev only; sign in with the username or the email):")
        for username, password, role in rows:
            self.stdout.write(f"  {username.ljust(width)}  {password.ljust(12)}  {role}")

    # --- TODO sections: each dev fills in their own, keeping the command idempotent ----------

    def _seed_leads(self, users):
        """~40 leads over the last 3 months, keyed by phone (re-running changes nothing)."""
        import random
        from datetime import datetime, time, timedelta

        from django.utils import timezone

        from apps.leads.models import Interaction, Lead
        from apps.leads.selectors import business_tz

        User = get_user_model()
        execs = [users["SALES_EXEC"]]
        for username, first, last in EXTRA_EXECS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "email": f"{username}@crm.local",
                    "role": "SALES_EXEC",
                },
            )
            if created:
                user.set_password("Exec@123")
                user.save()
            execs.append(user)
        manager = users["SALES_MANAGER"]

        rnd = random.Random(42)
        now = timezone.now()
        tz = business_tz()
        today_start = datetime.combine(now.astimezone(tz).date(), time.min, tzinfo=tz)
        late_evening = today_start + timedelta(hours=23, minutes=15)
        due_today = late_evening if late_evening > now else now + timedelta(minutes=30)
        sources = ["WEBSITE", "REFERRAL", "INSTAGRAM", "FACEBOOK", "GOOGLE_ADS", "WALK_IN", "EVENT"]
        reasons = ["PRICE", "COMPETITOR", "NO_RESPONSE", "NOT_INTERESTED"]
        created_count = 0

        for i, (name, status, followup) in enumerate(DEMO_LEADS):
            phone = f"+9198{i:08d}"
            if Lead.all_objects.filter(phone=phone).exists():
                continue
            created_at = now - timedelta(days=rnd.randint(1, 90), hours=rnd.randint(0, 20))
            assignee = None if i % 13 == 5 else execs[i % len(execs)]
            next_fu = {
                "overdue": now - timedelta(days=rnd.randint(1, 6), hours=2),
                "today": due_today,
                "upcoming": now + timedelta(days=rnd.randint(2, 10)),
                "none": None,
            }[followup]
            won = status == "WON"
            lead = Lead.objects.create(
                name=name,
                phone=phone,
                email=f"{name.split()[0].lower()}{i}@example.com" if i % 3 else "",
                source=sources[i % len(sources)],
                requirements=REQUIREMENTS[i % len(REQUIREMENTS)],
                status=status,
                assigned_to=assignee,
                next_followup_at=None if status in ("WON", "LOST") else next_fu,
                proposed_amount=(150000 + 25000 * (i % 12)) if status != "NEW" else None,
                won_at=created_at + timedelta(days=rnd.randint(3, 20)) if won else None,
                lost_reason=reasons[i % len(reasons)] if status == "LOST" else "",
                created_by=manager,
            )
            Lead.objects.filter(pk=lead.pk).update(created_at=created_at)
            touches = 0 if status == "NEW" and i % 2 == 0 else rnd.randint(1, 6)
            for n in range(touches):
                kind = ["CALL", "WHATSAPP", "MEETING", "NOTE", "EMAIL"][(i + n) % 5]
                row = Interaction.objects.create(
                    lead=lead,
                    type=kind,
                    notes=NOTES[(i + n) % len(NOTES)],
                    created_by=assignee or manager,
                )
                when = min(now, created_at + timedelta(days=n * 3 + 1, hours=rnd.randint(1, 8)))
                Interaction.objects.filter(pk=row.pk).update(created_at=when)
            created_count += 1
        self.stdout.write(f"  leads: {created_count} created ({Lead.objects.count()} in total)")
        # Ledgers for won leads are Dev C's (accounts.Ledger does not exist yet).

    def _seed_projects(self, users):
        """8 projects over 2 PMs with varied budget usage and ~50 expenses. Idempotent per lead."""
        from apps.projects.demo import seed_projects

        seed_projects(self, users)

    def _seed_ledgers(self, users):
        """A ledger for every won lead; most finalized, two awaiting finalization."""
        from apps.accounts.demo import seed_ledgers

        seed_ledgers(self, users)

    def _seed_payments(self, users):
        """Payments over ~6 months in every mode, some with proof, some voided; covers every aging bucket."""
        from apps.accounts.demo import seed_payments

        seed_payments(self, users)
