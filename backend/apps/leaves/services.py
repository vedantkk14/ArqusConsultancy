"""All leave writes. Views call these; nothing else writes leaves."""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.core.permissions import ADMIN
from apps.core.services import notify

from .exceptions import AlreadyDecided, InvalidRange
from .models import Holiday, LeaveRequest, LeaveStatus


def request_leave(user, *, start_date, end_date, reason: str) -> LeaveRequest:
    if end_date < start_date:
        raise InvalidRange()
    leave = LeaveRequest.objects.create(
        user=user, start_date=start_date, end_date=end_date, reason=reason
    )
    payload = {
        "employee_name": user.display_name,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
    }
    for admin in get_user_model().objects.filter(role=ADMIN, is_active=True):
        notify(admin, "leave_requested", payload)
    return leave


@transaction.atomic
def decide(leave: LeaveRequest, by, *, approve: bool, note: str = "") -> LeaveRequest:
    if by.role != ADMIN:
        raise PermissionDenied()
    leave = LeaveRequest.objects.select_for_update().get(pk=leave.pk)
    if leave.status != LeaveStatus.PENDING:
        raise AlreadyDecided()
    leave.status = LeaveStatus.APPROVED if approve else LeaveStatus.REJECTED
    leave.decided_by = by
    leave.decided_at = timezone.now()
    leave.decision_note = note
    leave.save()
    notify(
        leave.user,
        "leave_approved" if approve else "leave_rejected",
        {"start_date": leave.start_date.isoformat(), "end_date": leave.end_date.isoformat(), "note": note},
    )
    return leave


def withdraw(leave: LeaveRequest, by) -> None:
    """The requester cancels their own request. Only while it is still pending."""
    if leave.user_id != by.id:
        raise PermissionDenied()
    if leave.status != LeaveStatus.PENDING:
        raise AlreadyDecided()
    leave.delete()


def add_holiday(by, *, date, name: str) -> Holiday:
    if by.role != ADMIN:
        raise PermissionDenied()
    holiday, _ = Holiday.objects.update_or_create(date=date, defaults={"name": name})
    return holiday


def remove_holiday(by, holiday: Holiday) -> None:
    if by.role != ADMIN:
        raise PermissionDenied()
    holiday.delete()
