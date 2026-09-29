"""Leaves error codes. They leave the API as {"error": {"code", "message", "details"}}."""

from rest_framework import status
from rest_framework.exceptions import APIException


class LeaveError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, detail=None, **extra):
        super().__init__(detail)
        self.extra_details = extra


class InvalidRange(LeaveError):
    default_code = "invalid_range"
    default_detail = "The end date must be on or after the start date."


class AlreadyDecided(LeaveError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "already_decided"
    default_detail = "This request has already been decided."
