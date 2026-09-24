from django.db.models import Q
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import BaseThrottle, ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from apps.core.pagination import StandardPagination
from apps.core.permissions import HasRole

from . import services
from .exceptions import TokenInvalid
from .models import User
from .roles import ROLE_REFERENCE
from .serializers import (
    CommissionRateSerializer,
    LoginResponseSerializer,
    LoginSerializer,
    LogoutSerializer,
    MessageSerializer,
    PasswordChangeSerializer,
    PasswordForgotSerializer,
    PasswordResetSerializer,
    ProfileSerializer,
    ProfileUpdateSerializer,
    RefreshSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


class _PublicAuthView(APIView):
    """Unauthenticated endpoint: no JWT parsing (a stale header must not break login or logout)."""

    authentication_classes: list = []
    permission_classes = [AllowAny]


def _client_ip(request) -> str:
    return BaseThrottle().get_ident(request)


class LoginView(_PublicAuthView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(request=LoginSerializer, responses=LoginResponseSerializer)
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.authenticate_login(
            data.validated_data["identifier"], data.validated_data["password"], _client_ip(request)
        )
        tokens = services.issue_tokens(user)
        return Response(
            {
                **tokens,
                "user": UserSerializer(user).data,
                "must_change_password": user.must_change_password,
            }
        )


class RefreshView(_PublicAuthView):
    """Rotates: returns a new access AND refresh token; the old refresh token is blacklisted."""

    @extend_schema(request=RefreshSerializer, responses=RefreshSerializer)
    def post(self, request):
        serializer = TokenRefreshSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            raise TokenInvalid() from None
        except ValidationError:
            if not request.data.get("refresh"):
                raise
            raise TokenInvalid() from None
        return Response(serializer.validated_data)


class LogoutView(_PublicAuthView):
    """Blacklists the refresh token. Always 204, whatever it is given."""

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        token = request.data.get("refresh") if isinstance(request.data, dict) else None
        if isinstance(token, str) and token:
            services.blacklist_refresh(token)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(RetrieveUpdateAPIView):
    """GET /me; PATCH /me changes the caller's own name and phone only."""

    serializer_class = ProfileSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user

    @extend_schema(request=ProfileUpdateSerializer, responses=ProfileSerializer)
    def patch(self, request, *args, **kwargs):
        data = ProfileUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        user = request.user
        for field, value in data.validated_data.items():
            setattr(user, field, value.strip() if isinstance(value, str) else value)
        user.save()
        return Response(ProfileSerializer(user).data)


class UserViewSet(GenericViewSet):
    """Team > Users (Admin only). Assignments overview also serves the Sales Manager (read-only)."""

    queryset = User.objects.all().order_by("first_name", "username")
    serializer_class = UserAdminSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        roles = ("ADMIN", "SALES_MANAGER") if self.action == "assignments_overview" else ("ADMIN",)
        return [HasRole(*roles)()]

    def list(self, request):
        qs = self.get_queryset()
        params = request.query_params
        if params.get("role"):
            qs = qs.filter(
                role__in=[r for r in params["role"].upper().split(",") if r in User.Role.values]
            )
        flag = (params.get("is_active") or "").lower()
        if flag in ("true", "1", "false", "0"):
            qs = qs.filter(is_active=flag in ("true", "1"))
        if q := (params.get("q") or "").strip():
            qs = qs.filter(
                Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(username__icontains=q)
                | Q(email__icontains=q)
            )
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(UserAdminSerializer(page, many=True).data)

    def create(self, request):
        data = UserCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.create_user(dict(data.validated_data))
        return Response(UserAdminSerializer(user).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        return Response(UserAdminSerializer(self.get_object()).data)

    def partial_update(self, request, pk=None):
        data = UserUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        user = services.update_user(self.get_object(), dict(data.validated_data), request.user)
        return Response(UserAdminSerializer(user).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        return Response(
            UserAdminSerializer(services.deactivate_user(self.get_object(), request.user)).data
        )

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        return Response(UserAdminSerializer(services.reactivate_user(self.get_object())).data)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        """Returns the new temporary password once. It is not emailed and cannot be read again."""
        user = self.get_object()
        password = services.admin_reset_password(user)
        return Response({"temporary_password": password, "must_change_password": True})

    @action(detail=True, methods=["patch"], url_path="commission-rate")
    def commission_rate(self, request, pk=None):
        data = CommissionRateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.set_commission_rate(
            self.get_object(), data.validated_data["commission_rate"]
        )
        return Response(UserAdminSerializer(user).data)

    @action(detail=False, methods=["get"], url_path="assignments-overview")
    def assignments_overview(self, request):
        return Response(services.assignments_overview())

    @action(detail=False, methods=["get"])
    def roles(self, request):
        return Response(ROLE_REFERENCE)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PasswordChangeSerializer, responses=LoginResponseSerializer)
    def post(self, request):
        data = PasswordChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(data.validated_data["old_password"]):
            raise ValidationError({"old_password": ["Your current password is incorrect."]})
        new_password = data.validated_data["new_password"]
        if new_password == data.validated_data["old_password"]:
            raise ValidationError({"new_password": ["Choose a password you haven't used here."]})
        services.validate_new_password(new_password, user)
        tokens = services.change_password(user, new_password)
        return Response(
            {**tokens, "user": UserSerializer(user).data, "must_change_password": False}
        )


class PasswordForgotView(_PublicAuthView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_forgot"

    @extend_schema(request=PasswordForgotSerializer, responses=MessageSerializer)
    def post(self, request):
        data = PasswordForgotSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.send_password_reset(data.validated_data["email"])
        return Response({"message": services.FORGOT_PASSWORD_MESSAGE})


class PasswordResetView(_PublicAuthView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(
        request=PasswordResetSerializer,
        responses={200: MessageSerializer, 400: OpenApiResponse(description="reset_link_invalid")},
    )
    def post(self, request):
        data = PasswordResetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.user_from_reset_link(
            data.validated_data["uid"], data.validated_data["token"]
        )
        services.validate_new_password(data.validated_data["new_password"], user)
        services.reset_password(user, data.validated_data["new_password"])
        return Response({"message": "Password updated. Sign in with your new password."})
