from django.urls import path

from .views import (
    LoginView,
    LogoutView,
    MeView,
    PasswordChangeView,
    PasswordForgotView,
    PasswordResetView,
    RefreshView,
)

urlpatterns = [
    path("auth/login", LoginView.as_view(), name="auth-login"),
    path("auth/refresh", RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout", LogoutView.as_view(), name="auth-logout"),
    path("auth/password/change", PasswordChangeView.as_view(), name="auth-password-change"),
    path("auth/password/forgot", PasswordForgotView.as_view(), name="auth-password-forgot"),
    path("auth/password/reset", PasswordResetView.as_view(), name="auth-password-reset"),
    path("me", MeView.as_view(), name="me"),
]
