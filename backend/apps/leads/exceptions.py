"""Leads error codes. They leave the API as {"error": {"code", "message", "details"}}."""

from rest_framework import status
from rest_framework.exceptions import APIException


class LeadError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, detail=None, **extra):
        super().__init__(detail)
        self.extra_details = extra


class InvalidTransition(LeadError):
    default_code = "invalid_transition"
    default_detail = "This status change is not allowed."


class FollowupInPast(LeadError):
    default_code = "followup_in_past"
    default_detail = "The follow-up must not be in the past."


class FollowupOnClosed(LeadError):
    default_code = "followup_on_closed"
    default_detail = "Won and lost leads cannot have a follow-up."


class DuplicateLead(LeadError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "duplicate_lead"
    default_detail = "A lead with this phone number already exists."


class AccountsNotReady(LeadError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "accounts_not_ready"
    default_detail = "Finalizing is not available yet: the accounts module is not ready."


class HasLedger(LeadError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "has_ledger"
    default_detail = "This lead has an account ledger and cannot be deleted."


class NotWon(LeadError):
    default_code = "not_won"
    default_detail = "Only won leads can be finalized."


class PhoneUnusable(LeadError):
    default_code = "phone_unusable"
    default_detail = "This lead's phone number cannot be used for WhatsApp."
