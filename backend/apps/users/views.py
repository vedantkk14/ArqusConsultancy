from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import BaseThrottle, ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from apps.core.permissions import HasRole

from . import services
from .exceptions import TokenInvalid
from .serializers import (
    LoginResponseSerializer,
    LoginSerializer,
    LogoutSerializer,
    MessageSerializer,
    PasswordChangeSerializer,
    PasswordForgotSerializer,
    PasswordResetSerializer,
    RefreshSerializer,
    UserCreateSerializer,
    UserSerializer,
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


class MeView(RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class UserCreateView(APIView):
    """POST /api/v1/users: an Admin creates an account for any role."""

    permission_classes = [HasRole("ADMIN")]

    @extend_schema(request=UserCreateSerializer, responses=UserSerializer)
    def post(self, request):
        data = UserCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.create_user(dict(data.validated_data))
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


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
