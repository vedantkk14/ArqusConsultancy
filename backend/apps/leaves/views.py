from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.core.pagination import StandardPagination
from apps.core.permissions import ADMIN, HasRole

from . import selectors, services
from .models import Holiday
from .serializers import (
    HolidaySerializer,
    LeaveCreateSerializer,
    LeaveDecisionSerializer,
    LeaveRequestSerializer,
)


class LeaveRequestViewSet(viewsets.GenericViewSet):
    permission_classes = [HasRole(*selectors.ALL_ROLES)]
    pagination_class = StandardPagination
    serializer_class = LeaveRequestSerializer

    def get_queryset(self):
        return selectors.requests_for(self.request.user)

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(LeaveRequestSerializer(page, many=True).data)

    def create(self, request):
        serializer = LeaveCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        leave = services.request_leave(request.user, **serializer.validated_data)
        return Response(LeaveRequestSerializer(leave).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        """Withdraw your own request while it is still pending."""
        services.withdraw(self.get_object(), request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """?user_id= lets an admin check someone else's leave history before deciding."""
        target = request.user
        user_id = request.query_params.get("user_id")
        if user_id:
            if request.user.role != ADMIN and str(request.user.id) != str(user_id):
                raise PermissionDenied()
            target = get_object_or_404(get_user_model(), pk=user_id)
        return Response(selectors.summary_for(target))

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        leave = self.get_object()
        serializer = LeaveDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.decide(
            leave, request.user, approve=True, note=serializer.validated_data.get("note", "")
        )
        return Response(LeaveRequestSerializer(leave).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        leave = self.get_object()
        serializer = LeaveDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.decide(
            leave, request.user, approve=False, note=serializer.validated_data.get("note", "")
        )
        return Response(LeaveRequestSerializer(leave).data)


class HolidayViewSet(viewsets.GenericViewSet):
    permission_classes = [HasRole(*selectors.ALL_ROLES)]
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer

    def list(self, request):
        return Response(HolidaySerializer(self.get_queryset(), many=True).data)

    def create(self, request):
        serializer = HolidaySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        holiday = services.add_holiday(request.user, **serializer.validated_data)
        return Response(HolidaySerializer(holiday).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        services.remove_holiday(request.user, self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)
