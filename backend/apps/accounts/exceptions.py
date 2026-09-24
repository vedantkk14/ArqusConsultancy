# ruff: noqa: E501
"""Accounts error codes. They leave the API as {"error": {"code", "message", "details"}}."""

from rest_framework import status
from rest_framework.exceptions import APIException


class AccountsError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, detail=None, **extra):
        super().__init__(detail)
        self.extra_details = extra


class AlreadyFinalized(AccountsError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "already_finalized"
    default_detail = "This deal is already finalized."


class NotFinalized(AccountsError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "not_finalized"
    default_detail = "Finalize the deal amount before recording payments."


class TotalBelowReceived(AccountsError):
    default_code = "total_below_received"
    default_detail = "The total cannot be lower than what has been received."


class TotalBelowBudget(AccountsError):
    default_code = "total_below_budget"
    default_detail = "The total cannot be lower than the sanctioned budget of the linked project."


class Overpayment(AccountsError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "overpayment"
    default_detail = "This payment is more than the outstanding balance."


class DuplicatePayment(AccountsError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "duplicate_payment"
    default_detail = "The same payment was just recorded. Confirm to record it again."


class PaymentVoid(AccountsError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "payment_void"
    default_detail = "This payment is already void."


class InvalidPhone(AccountsError):
    default_code = "invalid_phone"
    default_detail = "This client's phone number cannot be used for WhatsApp."


class ProofError(AccountsError):
    default_code = "invalid_proof"
    default_detail = "This proof cannot be used."
