from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="display_name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "name", "email", "role", "must_change_password")
        read_only_fields = fields


class UserCreateSerializer(serializers.Serializer):
    """Admin creates an account. `password` is a temporary one the user is asked to replace."""

    username = serializers.RegexField(
        r"^[\w.@+-]+$",
        max_length=150,
        error_messages={"invalid": "Use letters, numbers and . _ - @ + only."},
    )
    email = serializers.EmailField(max_length=254)
    first_name = serializers.CharField(max_length=150, trim_whitespace=True)
    last_name = serializers.CharField(max_length=150, trim_whitespace=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=User.Role.choices)
    password = serializers.CharField(trim_whitespace=False, write_only=True, max_length=128)
    must_change_password = serializers.BooleanField(required=False, default=True)
    commission_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100, required=False
    )

    def validate(self, attrs):
        if "commission_rate" in attrs and attrs["role"] != User.Role.SALES_EXEC:
            raise serializers.ValidationError(
                {"commission_rate": ["Only sales executives have a commission rate."]}
            )
        return attrs

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value


class UserAdminSerializer(serializers.ModelSerializer):
    """What the Team pages see. `commission_rate`: 2-decimal string for execs, null otherwise."""

    name = serializers.CharField(source="display_name", read_only=True)
    commission_rate = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "name",
            "first_name",
            "last_name",
            "email",
            "phone",
            "role",
            "is_active",
            "must_change_password",
            "commission_rate",
            "last_login",
            "date_joined",
        )
        read_only_fields = fields

    def get_commission_rate(self, user):
        return f"{user.commission_rate:.2f}" if user.role == User.Role.SALES_EXEC else None


class UserUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(max_length=254, required=False)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=User.Role.choices, required=False)


class CommissionRateSerializer(serializers.Serializer):
    commission_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100
    )


class LoginSerializer(serializers.Serializer):
    """`identifier` is a username or an email. `username` is still accepted for older clients."""

    identifier = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    username = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate(self, attrs):
        identifier = attrs.get("identifier") or attrs.get("username") or ""
        if not identifier:
            raise serializers.ValidationError({"identifier": ["Enter your email or username."]})
        attrs["identifier"] = identifier
        return attrs


class LoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = UserSerializer()
    must_change_password = serializers.BooleanField()


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False, allow_blank=True)


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)


class PasswordForgotSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(trim_whitespace=False)


class MessageSerializer(serializers.Serializer):
    message = serializers.CharField()
