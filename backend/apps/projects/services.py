"""Business logic lives here, not in views or serializers. Every write is transactional."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.permissions import ADMIN, PROJECT_MANAGER

from . import integrations, receipts, rules, selectors
from .exceptions import (
    BudgetBelowSpent,
    BudgetExceedsTotal,
    EditWindowClosed,
    ExpenseVoid,
    NotCompleted,
    NotFinalized,
    NotWon,
    OverBudget,
    ProjectCompleted,
    ProjectExists,
)
from .models import (
    AlertState,
    EventType,
    Expense,
    Project,
    ProjectEvent,
    ProjectStatus,
)


def _name(user) -> str | None:
    return user.display_name if user else None


def _event(project, type_, actor, **data) -> ProjectEvent:
    return ProjectEvent.objects.create(project=project, type=type_, actor=actor, data=data)


def _admins():
    return get_user_model().objects.filter(role=ADMIN, is_active=True)


def _payload(project, **extra) -> dict:
    return {"project_id": project.pk, "project_name": project.name, **extra}


def _lock(project_id) -> Project:
    return Project.objects.select_for_update().select_related("pm", "lead").get(pk=project_id)


def _sync_alert(project, spent) -> None:
    """Store the current alert state; tell every admin only when it moves up."""
    new = selectors.budget_state(spent, project.sanctioned_budget).upper()
    old = project.alert_state
    if new == old:
        return
    project.alert_state = new
    project.save(update_fields=["alert_state", "updated_at"])
    if selectors.alert_state_rank(new) > selectors.alert_state_rank(old):
        kind = "budget_over" if new == AlertState.OVER else "budget_warn"
        payload = _payload(
            project,
            usage_pct=selectors.usage_pct(spent, project.sanctioned_budget),
            spent=selectors.money_str(spent),
            sanctioned_budget=selectors.money_str(project.sanctioned_budget),
        )
        for admin in _admins():
            integrations.notify(admin, kind, payload)


def _check_pm(pm_id):
    """An active PROJECT_MANAGER, or a field error."""
    user = get_user_model().objects.filter(pk=pm_id, is_active=True).first()
    if user is None or user.role != PROJECT_MANAGER:
        raise ValidationError({"pm": ["Choose an active project manager."]})
    return user


def _check_dates(start, end):
    if start and end and end < start:
        raise ValidationError(
            {"expected_end_date": ["The end date cannot be before the start date."]}
        )


def _check_budget_cap(project_or_lead, amount: Decimal) -> None:
    lead = getattr(project_or_lead, "lead", project_or_lead)
    total = integrations.deal_total(lead)
    if total is not None and amount > total:
        raise BudgetExceedsTotal(
            f"The budget cannot exceed the deal total of ₹{total:,.2f}.", max_budget=f"{total:.2f}"
        )


# ---- Projects ----------


@transaction.atomic
def convert(
    lead_id, *, name, sanctioned_budget: Decimal, pm_id, start_date, expected_end_date, scope, by
) -> Project:
    lead = integrations.lock_lead(lead_id)
    if lead is None:
        raise ValidationError({"lead": ["This lead does not exist."]})
    existing = Project.objects.filter(lead=lead).first()
    if existing:
        raise ProjectExists(project_id=existing.pk)
    if lead.status != "WON":
        raise NotWon()
    if integrations.finalization_problem(lead):
        raise NotFinalized()
    if sanctioned_budget <= 0:
        raise ValidationError({"sanctioned_budget": ["Enter an amount above zero."]})
    _check_budget_cap(lead, sanctioned_budget)
    _check_dates(start_date, expected_end_date)
    pm = _check_pm(pm_id) if pm_id else None

    project = Project.objects.create(
        name=name,
        client_name=lead.name,
        lead=lead,
        pm=pm,
        sanctioned_budget=sanctioned_budget,
        start_date=start_date,
        expected_end_date=expected_end_date,
        scope=scope or "",
        created_by=by,
    )
    _event(
        project,
        EventType.CREATED,
        by,
        sanctioned_budget=selectors.money_str(sanctioned_budget),
        pm=_name(pm),
    )
    if pm:
        integrations.notify(pm, "project_assigned", _payload(project))
    return project


@transaction.atomic
def update_details(project_id, data: dict, by) -> Project:
    project = _lock(project_id)
    for field in ("name", "start_date", "expected_end_date", "scope"):
        if field in data:
            setattr(project, field, data[field])
    _check_dates(project.start_date, project.expected_end_date)
    project.save()
    return project


@transaction.atomic
def change_budget(project_id, amount: Decimal, reason: str, by) -> Project:
    project = _lock(project_id)
    if project.status != ProjectStatus.RUNNING:
        raise ProjectCompleted()
    if amount <= 0:
        raise ValidationError({"sanctioned_budget": ["Enter an amount above zero."]})
    spent = selectors.spent_for(project)
    if amount < spent:
        raise BudgetBelowSpent(
            f"The budget cannot be lower than the ₹{spent:,.2f} already spent.",
            spent=selectors.money_str(spent),
        )
    _check_budget_cap(project, amount)
    old = project.sanctioned_budget
    project.sanctioned_budget = amount
    project.save(update_fields=["sanctioned_budget", "updated_at"])
    _event(
        project,
        EventType.BUDGET_CHANGED,
        by,
        old=selectors.money_str(old),
        new=selectors.money_str(amount),
        reason=reason,
    )
    _sync_alert(project, spent)
    if project.pm:
        integrations.notify(
            project.pm,
            "budget_changed",
            _payload(project, old=selectors.money_str(old), new=selectors.money_str(amount)),
        )
    return project


@transaction.atomic
def assign_pm(project_id, pm_id, by) -> Project:
    project = _lock(project_id)
    if project.status != ProjectStatus.RUNNING:
        raise ProjectCompleted()
    new = _check_pm(pm_id) if pm_id else None
    old = project.pm
    if (old.pk if old else None) == (new.pk if new else None):
        return project
    project.pm = new
    project.save(update_fields=["pm", "updated_at"])
    _event(project, EventType.PM_ASSIGNED, by, pm=_name(new), previous_pm=_name(old))
    if old:
        integrations.notify(old, "project_unassigned", _payload(project))
    if new:
        integrations.notify(new, "project_assigned", _payload(project))
    return project


@transaction.atomic
def complete(project_id, by) -> Project:
    project = _lock(project_id)
    if project.status != ProjectStatus.RUNNING:
        raise ProjectCompleted()
    project.status = ProjectStatus.COMPLETED
    project.completed_at = timezone.now()
    project.completed_by = by
    project.save(update_fields=["status", "completed_at", "completed_by", "updated_at"])
    spent = selectors.spent_for(project)
    _event(project, EventType.COMPLETED, by, spent=selectors.money_str(spent))
    recipients = list(_admins())
    if project.pm:
        recipients.append(project.pm)
    for user in {u.pk: u for u in recipients if u.pk != by.pk}.values():
        integrations.notify(user, "project_completed", _payload(project))
    return project


@transaction.atomic
def reopen(project_id, reason: str, by) -> Project:
    project = _lock(project_id)
    if project.status != ProjectStatus.COMPLETED:
        raise NotCompleted()
    project.status = ProjectStatus.RUNNING
    project.completed_at = None
    project.completed_by = None
    project.save(update_fields=["status", "completed_at", "completed_by", "updated_at"])
    _event(project, EventType.REOPENED, by, reason=reason)
    if project.pm:
        integrations.notify(project.pm, "project_reopened", _payload(project, reason=reason))
    return project


# ---- Expenses ----------


def _receipt_required(category: str) -> bool:
    return rules.RECEIPT_REQUIRED and category not in rules.RECEIPT_EXEMPT_CATEGORIES


def _apply_budget_rule(
    project, spent_before: Decimal, amount: Decimal, by, override: bool, reason: str
) -> bool:
    """True when the expense goes through only because an admin overrode the limit."""
    if not rules.BLOCK_OVER_BUDGET or spent_before + amount <= project.sanctioned_budget:
        return False
    if by.role == ADMIN and override:
        if not reason.strip():
            raise ValidationError({"override_reason": ["Give a reason for going over budget."]})
        return True
    left = max(selectors.remaining(spent_before, project.sanctioned_budget), Decimal("0"))
    raise OverBudget(
        f"This exceeds the remaining budget of ₹{left:,.2f}.", remaining=selectors.money_str(left)
    )


def _store_receipt(expense, receipt: receipts.Receipt) -> None:
    expense.receipt.save(f"receipt.{receipt.ext}", ContentFile(receipt.data), save=False)
    expense.receipt_kind = receipt.kind
    expense.receipt_type = receipt.content_type


def _discard(name: str | None) -> None:
    if name:
        Expense._meta.get_field("receipt").storage.delete(name)


def add_expense(project_id, by, data: dict, upload=None) -> Expense:
    if upload is None and _receipt_required(data["category"]):
        raise ValidationError({"receipt": ["Attach a receipt for this expense."]})
    receipt = receipts.process(upload) if upload is not None else None
    stored = None
    try:
        with transaction.atomic():
            project = _lock(project_id)
            if project.status != ProjectStatus.RUNNING:
                raise ProjectCompleted()
            spent = selectors.spent_for(project)
            override = _apply_budget_rule(
                project,
                spent,
                data["amount"],
                by,
                data.get("admin_override", False),
                data.get("override_reason", ""),
            )
            expense = Expense(
                project=project,
                amount=data["amount"],
                category=data["category"],
                spent_on=data["spent_on"],
                vendor=data.get("vendor", ""),
                description=data.get("description", ""),
                logged_by=by,
                is_override=override,
                override_reason=data.get("override_reason", "") if override else "",
            )
            if receipt:
                _store_receipt(expense, receipt)
                stored = expense.receipt.name
            expense.save()
            _event(
                project,
                EventType.EXPENSE_ADDED,
                by,
                expense_id=expense.pk,
                amount=selectors.money_str(expense.amount),
                category=expense.category,
                is_override=override,
            )
            _sync_alert(project, spent + expense.amount)
            return expense
    except Exception:
        _discard(stored)
        raise


def _require_can_change(user, expense) -> None:
    if expense.project.status != ProjectStatus.RUNNING:
        raise ProjectCompleted()
    if expense.is_void:
        raise ExpenseVoid()
    if user.role == ADMIN:
        return
    if (
        user.role != PROJECT_MANAGER
        or expense.project.pm_id != user.pk
        or expense.logged_by_id != user.pk
    ):
        raise PermissionDenied()
    if not selectors.edit_window_open(expense):
        raise EditWindowClosed()


def edit_expense(expense_id, by, data: dict, upload=None) -> Expense:
    receipt = receipts.process(upload) if upload is not None else None
    stored = None
    old_name = None
    try:
        with transaction.atomic():
            expense = Expense.objects.select_for_update().get(pk=expense_id)
            project = _lock(expense.project_id)
            expense.project = project
            _require_can_change(by, expense)
            spent_others = selectors.spent_for(project) - expense.amount
            amount = data.get("amount", expense.amount)
            override = _apply_budget_rule(
                project,
                spent_others,
                amount,
                by,
                data.get("admin_override", False),
                data.get("override_reason", ""),
            )
            for field in ("amount", "category", "spent_on", "vendor", "description"):
                if field in data:
                    setattr(expense, field, data[field])
            if receipt:
                old_name = expense.receipt.name or None
                _store_receipt(expense, receipt)
                stored = expense.receipt.name
            elif not expense.receipt and _receipt_required(expense.category):
                raise ValidationError({"receipt": ["Attach a receipt for this expense."]})
            if override:
                expense.is_override = True
                expense.override_reason = data.get("override_reason", "")
            expense.save()
            _event(
                project,
                EventType.EXPENSE_EDITED,
                by,
                expense_id=expense.pk,
                amount=selectors.money_str(expense.amount),
                category=expense.category,
            )
            _sync_alert(project, spent_others + expense.amount)
    except Exception:
        _discard(stored)
        raise
    _discard(old_name)
    return expense


@transaction.atomic
def void_expense(expense_id, by, reason: str) -> Expense:
    expense = Expense.objects.select_for_update().get(pk=expense_id)
    project = _lock(expense.project_id)
    expense.project = project
    _require_can_change(by, expense)
    expense.is_void = True
    expense.void_reason = reason
    expense.voided_at = timezone.now()
    expense.voided_by = by
    expense.save(update_fields=["is_void", "void_reason", "voided_at", "voided_by", "updated_at"])
    _event(
        project,
        EventType.EXPENSE_VOIDED,
        by,
        expense_id=expense.pk,
        amount=selectors.money_str(expense.amount),
        category=expense.category,
        reason=reason,
    )
    _sync_alert(project, selectors.spent_for(project))
    return expense
