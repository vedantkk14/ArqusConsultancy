"""Bulk lead import from an Excel (.xlsx) or CSV file.

Two passes over the same file: a preview (`dry_run`) that only validates and reports, then the real
import. Rows are checked with the same serializer as the Add lead form, so a row that imports here
would also have been accepted there. Bad rows and duplicates are skipped and reported; they never
stop the good rows.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field

from django.contrib.auth import get_user_model
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import LeadSource
from .serializers import LeadWriteSerializer
from .services import ASSIGNEE_ROLES, can_create, create_lead, find_duplicate

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_ROWS = 1000
MAX_REPORTED = 50  # rows listed per problem kind; the counts are always exact

#: Template column -> accepted header spellings (lower-case, spaces and punctuation ignored).
COLUMNS = {
    "name": ("name", "leadname", "fullname", "customer", "customername", "client"),
    "phone": ("phone", "mobile", "mobileno", "mobilenumber", "phonenumber", "contact", "contactno"),
    "email": ("email", "emailid", "emailaddress", "mail"),
    "source": ("source", "leadsource", "channel"),
    "assigned_to": ("assignedto", "assignee", "owner", "executive", "salesexecutive"),
    "requirements": ("requirements", "requirement", "notes", "remarks", "details", "interest"),
    "proposed_amount": ("proposedvalue", "proposedamount", "value", "amount", "budget"),
}
TEMPLATE_HEADERS = [
    "Name",
    "Phone",
    "Email",
    "Source",
    "Assigned to",
    "Requirements",
    "Proposed value",
]
TEMPLATE_EXAMPLE = [
    "Rahul Sharma",
    "98765 43210",
    "rahul@example.com",
    "Referral",
    "",
    "Turf for a football academy",
    "250000",
]


class ImportFileError(ValidationError):
    """The file itself can't be used (wrong type, too big, missing columns, too many rows)."""


@dataclass
class ImportReport:
    dry_run: bool
    total: int = 0
    ready: int = 0  # valid rows (previewed) or leads created (real run)
    duplicates: list[dict] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    duplicate_count: int = 0
    error_count: int = 0

    def as_dict(self) -> dict:
        return {
            "dry_run": self.dry_run,
            "total": self.total,
            "ready": self.ready,
            "created": 0 if self.dry_run else self.ready,
            "duplicate_count": self.duplicate_count,
            "error_count": self.error_count,
            "duplicates": self.duplicates,
            "errors": self.errors,
        }


def _key(text) -> str:
    return "".join(ch for ch in str(text or "").lower() if ch.isalnum())


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)  # a phone typed as a number arrives as 9.8765e9
    return str(value).strip()


def read_rows(upload) -> list[dict]:
    """[{row: sheet row number, name: ..., phone: ...}] for every non-empty data row."""
    filename = (getattr(upload, "name", "") or "").lower()
    if getattr(upload, "size", 0) > MAX_FILE_BYTES:
        raise ImportFileError(
            {"file": ["The file is larger than 2 MB. Split it and import in parts."]}
        )
    data = upload.read()
    if filename.endswith(".csv"):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        grid = list(csv.reader(io.StringIO(text)))
    elif filename.endswith(".xlsx"):
        from openpyxl import load_workbook

        try:
            book = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            grid = [list(r) for r in book.worksheets[0].iter_rows(values_only=True)]
        except Exception as exc:  # noqa: BLE001 - any parser failure is "not a usable workbook"
            raise ImportFileError({"file": ["This doesn't look like a valid .xlsx file."]}) from exc
    else:
        raise ImportFileError({"file": ["Upload an Excel (.xlsx) or CSV file."]})

    grid = [r for r in grid if any(_cell(c) for c in r)]
    if not grid:
        raise ImportFileError({"file": ["The file has no rows."]})
    lookup = {alias: col for col, aliases in COLUMNS.items() for alias in aliases}
    index = {}
    for i, head in enumerate(grid[0]):
        col = lookup.get(_key(head))
        if col and col not in index:
            index[col] = i
    missing = [c.title() for c in ("name", "phone") if c not in index]
    if missing:
        raise ImportFileError(
            {"file": [f"Missing column: {', '.join(missing)}. Use the template for the layout."]}
        )
    body = grid[1:]
    if len(body) > MAX_ROWS:
        raise ImportFileError(
            {"file": [f"Too many rows ({len(body)}). The limit is {MAX_ROWS} per file."]}
        )
    rows = []
    for number, raw in enumerate(grid[1:], start=2):
        row = {col: _cell(raw[i]) if i < len(raw) else "" for col, i in index.items()}
        row["row"] = number
        rows.append(row)
    return rows


def _source(text: str) -> dict:
    """Known sources by label or code; anything else becomes Other with the text kept."""
    if not text:
        return {}
    wanted = _key(text)
    for value, label in LeadSource.choices:
        if wanted in (_key(value), _key(label)):
            return {"source": value}
    return {"source": LeadSource.OTHER, "source_other": text[:100]}


def _assignees() -> dict[str, int]:
    User = get_user_model()  # noqa: N806
    found = {}
    for user in User.objects.filter(role__in=ASSIGNEE_ROLES, is_active=True):
        for text in (user.email, user.display_name, user.username):
            if text:
                found.setdefault(_key(text), user.pk)
    return found


def _first_message(detail) -> str:
    if isinstance(detail, dict):
        return _first_message(next(iter(detail.values()))) if detail else "Invalid row."
    if isinstance(detail, list):
        return _first_message(detail[0]) if detail else "Invalid row."
    return str(detail)


def import_leads(upload, by, dry_run: bool, skip_duplicates: bool = True) -> ImportReport:
    if not can_create(by):
        raise PermissionDenied()
    rows = read_rows(upload)
    report = ImportReport(dry_run=dry_run, total=len(rows))
    assignees = _assignees()
    seen: set[str] = set()

    def problem(kind: str, row: dict, message: str):
        counter = "duplicate_count" if kind == "duplicates" else "error_count"
        setattr(report, counter, getattr(report, counter) + 1)
        items = getattr(report, kind)
        if len(items) < MAX_REPORTED:
            items.append(
                {
                    "row": row["row"],
                    "name": row.get("name", ""),
                    "phone": row.get("phone", ""),
                    "reason": message,
                }
            )

    for row in rows:
        payload = {"name": row.get("name", ""), "phone": row.get("phone", "")}
        for optional in ("email", "requirements", "proposed_amount"):
            if row.get(optional):
                payload[optional] = row[optional]
        payload.update(_source(row.get("source", "")))
        wanted = row.get("assigned_to", "")
        if wanted:
            user_id = assignees.get(_key(wanted))
            if user_id is None:
                problem("errors", row, f"No active sales executive matches “{wanted}”.")
                continue
            payload["assigned_to"] = user_id
        elif by.role == "SALES_EXEC":
            payload["assigned_to"] = by.pk
        serializer = LeadWriteSerializer(data=payload)
        if not serializer.is_valid():
            problem("errors", row, _first_message(serializer.errors))
            continue
        data = dict(serializer.validated_data)
        phone = data["phone"]
        if phone in seen or find_duplicate(phone):
            if skip_duplicates:
                reason = (
                    "Repeated in this file."
                    if phone in seen
                    else "A lead with this phone number already exists."
                )
                problem("duplicates", row, reason)
                continue
        seen.add(phone)
        if dry_run:
            report.ready += 1
            continue
        try:
            create_lead(data, by, force=True)
        except ValidationError as exc:
            problem("errors", row, _first_message(exc.detail))
            continue
        report.ready += 1
    return report


def template_workbook() -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font

    book = Workbook()
    sheet = book.active
    sheet.title = "Leads"
    sheet.append(TEMPLATE_HEADERS)
    sheet.append(TEMPLATE_EXAMPLE)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    for letter, width in zip("ABCDEFG", (22, 16, 26, 14, 26, 36, 16), strict=True):
        sheet.column_dimensions[letter].width = width
    notes = book.create_sheet("Notes")
    for line in (
        "Name and Phone are required. Everything else is optional.",
        "Delete the example row before importing.",
        "Source: "
        + ", ".join(label for _, label in LeadSource.choices)
        + ". Anything else is saved as Other.",
        "Assigned to: email or full name of an active sales executive. Empty = assign later.",
        "Phone numbers already in the system, or repeated in the file, are skipped.",
    ):
        notes.append([line])
    notes.column_dimensions["A"].width = 100
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()
