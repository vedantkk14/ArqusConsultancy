"""GET /api/v1/notifications: a user only ever sees their own."""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.pagination import StandardPagination

from . import services
from .models import Notification
from .serializers import NotificationSerializer


class NotImplementedYet(APIException):
    status_code = status.HTTP_501_NOT_IMPLEMENTED
    default_code = "not_implemented"
    default_detail = "Push notifications are not available yet: they arrive with the mobile app."


class NotificationViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)

    def list(self, request):
        qs = self.get_queryset()
        flag = (request.query_params.get("is_read") or "").lower()
        if flag in ("true", "1"):
            qs = qs.filter(is_read=True)
        elif flag in ("false", "0"):
            qs = qs.filter(is_read=False)
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(NotificationSerializer(page, many=True).data)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": services.unread_count(request.user)})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        return Response(NotificationSerializer(services.mark_read(self.get_object())).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        return Response({"updated": services.mark_all_read(request.user)})

    @action(detail=False, methods=["post"])
    def devices(self, request):
        raise NotImplementedYet()
