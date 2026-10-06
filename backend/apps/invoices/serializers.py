from decimal import Decimal

from rest_framework import serializers

from . import calc
from .company import COMPANY
from .models import Invoice, InvoiceItem, TaxType


class ItemInputSerializer(serializers.Serializer):
    particulars = serializers.CharField(max_length=2000)
    hsn = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    quantity = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=Decimal("0.0001"),
        error_messages={"min_value": "Enter a quantity."},
    )  # fmt: skip
    rate = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"),
        error_messages={"min_value": "The rate cannot be negative."},
    )  # fmt: skip
    unit = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")


class InvoiceInputSerializer(serializers.Serializer):
    invoice_no = serializers.CharField(max_length=60)
    title = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    invoice_date = serializers.DateField()
    client_name = serializers.CharField(max_length=150)
    client_address = serializers.CharField(
        max_length=1000, required=False, allow_blank=True, default=""
    )
    client_gstin = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=""
    )
    client_phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=""
    )
    client_email = serializers.EmailField(required=False, allow_blank=True, default="")
    tax_type = serializers.ChoiceField(choices=TaxType.choices, default=TaxType.IGST)
    gst_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"),
        required=False, allow_null=True, default=None,
    )  # fmt: skip
    items = ItemInputSerializer(many=True, allow_empty=False, max_length=50)

    def validate_invoice_no(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter the invoice number.")
        clash = Invoice.objects.filter(invoice_no__iexact=value)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("An invoice with this number already exists.")
        return value

    def validate_client_gstin(self, value):
        return value.strip().upper()


class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = ("id", "particulars", "hsn", "quantity", "rate", "unit", "amount")


class InvoiceListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = (
            "id",
            "invoice_no",
            "title",
            "client_name",
            "client_email",
            "client_phone",
            "invoice_date",
            "total",
            "emailed_at",
            "whatsapp_at",
            "created_at",
        )


class InvoiceDetailSerializer(InvoiceListSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    figures = serializers.SerializerMethodField()
    amount_in_words = serializers.SerializerMethodField()
    company = serializers.SerializerMethodField()

    class Meta(InvoiceListSerializer.Meta):
        fields = InvoiceListSerializer.Meta.fields + (
            "client_address",
            "client_gstin",
            "tax_type",
            "gst_percent",
            "subtotal",
            "tax_amount",
            "round_off",
            "items",
            "figures",
            "amount_in_words",
            "company",
        )

    def get_figures(self, obj):
        """CGST / SGST split for display (the stored tax_amount is the whole GST)."""
        f = calc.compute(
            [(i.quantity, i.rate) for i in obj.items.all()], obj.gst_percent, obj.tax_type
        )
        return {"cgst": f"{f['cgst']:.2f}", "sgst": f"{f['sgst']:.2f}"}

    def get_amount_in_words(self, obj):
        return calc.in_words(obj.total)

    def get_company(self, obj):
        """ "Bill from": the same details the PDF prints, so the preview can never differ."""
        return COMPANY


class EmailInvoiceSerializer(serializers.Serializer):
    to = serializers.EmailField(required=False, allow_blank=True)
    message = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class WhatsAppInvoiceSerializer(serializers.Serializer):
    phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
