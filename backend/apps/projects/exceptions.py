"""Projects error codes. They leave the API as {"error": {"code", "message", "details"}}."""

from rest_framework import status
from rest_framework.exceptions import APIException


class ProjectError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, detail=None, **extra):
        super().__init__(detail)
        self.extra_details = extra


class NotWon(ProjectError):
    default_code = "not_won"
    default_detail = "Only won deals can be converted to a project."


class ProjectExists(ProjectError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "project_exists"
    default_detail = "This deal is already a project."


class NotFinalized(ProjectError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "not_finalized"
    default_detail = "This deal is not finalized in accounts yet."


class BudgetExceedsTotal(ProjectError):
    default_code = "budget_exceeds_total"
    default_detail = "The budget cannot exceed the deal total."


class BudgetBelowSpent(ProjectError):
    default_code = "budget_below_spent"
    default_detail = "The budget cannot be lower than what is already spent."


class OverBudget(ProjectError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "over_budget"
    default_detail = "This exceeds the remaining budget."


class ProjectCompleted(ProjectError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "project_completed"
    default_detail = "This project is completed. Reopen it to make changes."


class NotCompleted(ProjectError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "not_completed"
    default_detail = "Only completed projects can be reopened."


class ExpenseVoid(ProjectError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "expense_void"
    default_detail = "This expense is already void."


class EditWindowClosed(ProjectError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "edit_window_closed"
    default_detail = "The edit window has closed. Ask an admin to change this expense."


class ReceiptError(ProjectError):
    default_code = "invalid_receipt"
    default_detail = "This receipt cannot be used."
