"""Auth errors. Each maps to one code in the {"error": {code, message, details}} contract."""

from rest_framework import status
from rest_framework.exceptions import APIException


class InvalidCredentials(APIException):
    """Same response for an unknown account and a wrong password (no account enumeration)."""

    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "invalid_credentials"
    default_detail = "Incorrect email or password."


class AccountDisabled(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = "account_disabled"
    default_detail = "This account is disabled. Contact your administrator."


class AccountLocked(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "account_locked"
    default_detail = "Too many failed attempts. Try again later."

    def __init__(self, retry_after: int):
        super().__init__()
        self.extra_details = {"retry_after": retry_after}


class TokenInvalid(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = "token_invalid"
    default_detail = "Your session has expired. Please sign in again."


class ResetLinkInvalid(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "reset_link_invalid"
    default_detail = "This reset link is invalid or has expired. Request a new one."
