"""Every error leaves the API as {"error": {"code", "message", "details"}}."""

import logging
import math

from rest_framework import status
from rest_framework.exceptions import APIException, Throttled, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)

_STATUS_CODES = {
    status.HTTP_400_BAD_REQUEST: "bad_request",
    status.HTTP_401_UNAUTHORIZED: "not_authenticated",
    status.HTTP_403_FORBIDDEN: "permission_denied",
    status.HTTP_404_NOT_FOUND: "not_found",
    status.HTTP_405_METHOD_NOT_ALLOWED: "method_not_allowed",
    status.HTTP_429_TOO_MANY_REQUESTS: "throttled",
}


def _error(code, message, details, http_status):
    return Response(
        {"error": {"code": code, "message": message, "details": details}},
        status=http_status,
    )


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:  # unhandled exception -> consistent 500
        logger.exception("Unhandled error in API view", exc_info=exc)
        return _error(
            "server_error",
            "An unexpected error occurred.",
            {},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, ValidationError):
        details = response.data
        if not isinstance(details, dict):
            details = {"non_field_errors": details}
        return _error("validation_error", "Validation failed.", details, response.status_code)

    if isinstance(exc, Throttled):
        details = {"retry_after": math.ceil(exc.wait) if exc.wait is not None else None}
        return _error(
            "too_many_requests",
            "Too many attempts. Please wait and try again.",
            details,
            response.status_code,
        )

    code = (
        exc.default_code
        if isinstance(exc, APIException)
        else _STATUS_CODES.get(response.status_code, "error")
    )
    data = response.data if isinstance(response.data, dict) else {}
    message = str(data.get("detail", "Request failed."))
    details = {k: v for k, v in data.items() if k != "detail"}
    # Exceptions may carry structured extras (e.g. {"retry_after": 900}) that should stay typed.
    details.update(getattr(exc, "extra_details", None) or {})
    if code == "token_not_valid":  # SimpleJWT's name for a bad/expired token -> our contract name
        code = "token_invalid"
    return _error(code, message, details, response.status_code)
