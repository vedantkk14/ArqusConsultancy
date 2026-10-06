from rest_framework import status
from rest_framework.exceptions import APIException


class InvoiceEmailFailed(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = "invoice_email_failed"
    default_detail = "The invoice email could not be sent. Please try again in a moment."


class NoRecipient(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "no_recipient"
    default_detail = "Add the client's email address or phone number first."
