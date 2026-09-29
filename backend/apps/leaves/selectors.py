"""Read side of leaves: role scoping and the taken-leave summary admins review before deciding."""

from django.utils import timezone

from apps.core.permissions import ADMIN

from .models import LeaveRequest, LeaveStatus

ALL_ROLES = ("ADMIN", "SALES_MANAGER", "SALES_EXEC", "PROJECT_MANAGER")


def requests_for(user):
    """An admin sees every request; everyone else only their own."""
    qs = LeaveRequest.objects.select_related("user", "decided_by")
    if user.role == ADMIN:
        return qs
    return qs.filter(user=user)


def summary_for(user, today=None) -> dict:
    """Approved leave days taken this month and this year, for the leave-history admins check."""
    today = today or timezone.now().date()
    approved = LeaveRequest.objects.filter(user=user, status=LeaveStatus.APPROVED)
    this_year = approved.filter(start_date__year=today.year)
    this_month = this_year.filter(start_date__month=today.month)
    return {
        "this_month": sum(r.days for r in this_month),
        "this_year": sum(r.days for r in this_year),
    }
