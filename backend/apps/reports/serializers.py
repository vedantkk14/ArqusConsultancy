"""Admin dashboard: query validation and the documented response shape (for OpenAPI)."""

from rest_framework import serializers

from .services import DEFAULT_PERIOD, PERIODS


def _money():
    return serializers.DecimalField(max_digits=12, decimal_places=2)


class DashboardQuerySerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=PERIODS, default=DEFAULT_PERIOD, required=False)


class _Range(serializers.Serializer):
    start = serializers.DateField(allow_null=True)
    end = serializers.DateField()
    prev_start = serializers.DateField(allow_null=True)
    prev_end = serializers.DateField(allow_null=True)


class _Kpis(serializers.Serializer):
    received = serializers.DecimalField(max_digits=12, decimal_places=2)
    received_prev = serializers.DecimalField(max_digits=12, decimal_places=2)
    received_delta_pct = serializers.CharField(allow_null=True)
    outstanding = serializers.DecimalField(max_digits=12, decimal_places=2)
    outstanding_clients = serializers.IntegerField()
    outstanding_overdue = serializers.DecimalField(max_digits=12, decimal_places=2)
    leads_total = serializers.IntegerField()
    leads_new = serializers.IntegerField()
    leads_new_prev = serializers.IntegerField()
    open_count = serializers.IntegerField()
    open_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    won_count = serializers.IntegerField()
    lost_count = serializers.IntegerField()
    win_rate_pct = serializers.CharField()
    projects_running = serializers.IntegerField()
    projects_completed = serializers.IntegerField()
    spent = _money()
    net = _money()
    net_margin_pct = serializers.CharField()
    collection_rate_pct = serializers.CharField()


class _Trends(serializers.Serializer):
    months = serializers.ListField(child=serializers.CharField())
    leads_new = serializers.ListField(child=serializers.IntegerField())
    received = serializers.ListField(child=_money())


class _Cashflow(serializers.Serializer):
    months = serializers.ListField(child=serializers.CharField())
    collected = serializers.ListField(child=_money())
    spent = serializers.ListField(child=_money())
    net = serializers.ListField(child=_money())


class _Attention(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    count = serializers.IntegerField()
    severity = serializers.ChoiceField(choices=["high", "medium", "low"])
    route = serializers.CharField()


class AdminDashboardSerializer(serializers.Serializer):
    period = serializers.ChoiceField(choices=PERIODS)
    range = _Range()
    data_sources = serializers.DictField(child=serializers.BooleanField())
    kpis = _Kpis()
    trends = _Trends()
    cashflow = _Cashflow()
    attention = _Attention(many=True)
    funnel = serializers.ListField(child=serializers.DictField())
    sales_by_exec = serializers.ListField(child=serializers.DictField())
    lead_sources = serializers.ListField(child=serializers.DictField())
    collections_aging = serializers.ListField(child=serializers.DictField())
    top_overdue_clients = serializers.ListField(child=serializers.DictField())
    projects_burn = serializers.ListField(child=serializers.DictField())
    recent = serializers.DictField(child=serializers.ListField(child=serializers.DictField()))
