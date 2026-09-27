"""Read-only reference lists, introspected from the live TextChoices so they never go stale.

Each list is owned by the app that defines it; this only reads them. To add or change a value,
change the choices in that app's model and migrate.
"""

from django.apps import apps
from django.core.exceptions import FieldDoesNotExist

MANIFEST = [
    {
        "key": "lead_sources",
        "label": "Lead sources",
        "app": "leads",
        "model": "Lead",
        "field": "source",
    },
    {
        "key": "lead_lost_reasons",
        "label": "Lead lost reasons",
        "app": "leads",
        "model": "Lead",
        "field": "lost_reason",
    },
    {
        "key": "expense_categories",
        "label": "Expense categories",
        "app": "projects",
        "model": "Expense",
        "field": "category",
    },
    {
        "key": "payment_modes",
        "label": "Payment modes",
        "app": "accounts",
        "model": "Payment",
        "field": "mode",
    },
]


def build_master_data() -> list[dict]:
    lists = []
    for entry in MANIFEST:
        choices, available = [], False
        try:  # TODO(depends on projects.Expense / accounts.Payment, Dev B / Dev C)
            field = apps.get_model(entry["app"], entry["model"])._meta.get_field(entry["field"])
            choices = [{"value": str(v), "label": str(label)} for v, label in (field.choices or [])]
            available = bool(choices)
        except (LookupError, FieldDoesNotExist):
            pass
        lists.append(
            {
                "key": entry["key"],
                "label": entry["label"],
                "source": f"{entry['app']}.{entry['model']}.{entry['field']}",
                "owner_app": entry["app"],
                "available": available,
                "values": choices,
            }
        )
    return lists
