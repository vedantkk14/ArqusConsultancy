export type TaxType = 'IGST' | 'CGST_SGST';

export interface InvoiceItem {
  id?: number;
  particulars: string;
  hsn: string;
  /** Decimal strings, e.g. "8304.0948" and "381.00". */
  quantity: string;
  rate: string;
  unit: string;
  amount?: string;
}

/** One row of the invoices list. */
export interface InvoiceRow {
  id: number;
  invoice_no: string;
  /** The editable name (the job or project), shown in lists and used in emails. */
  title: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  invoice_date: string;
  total: string;
  emailed_at: string | null;
  whatsapp_at: string | null;
  created_at: string;
}

export interface Company {
  name: string;
  short_name: string;
  address_lines: string[];
  phone: string;
  email: string;
  website: string;
  pan: string;
  gstin: string;
}

export interface Invoice extends InvoiceRow {
  client_address: string;
  client_gstin: string;
  tax_type: TaxType;
  gst_percent: string | null;
  subtotal: string;
  tax_amount: string;
  round_off: string;
  items: InvoiceItem[];
  figures: { cgst: string; sgst: string };
  amount_in_words: string;
  /** "Bill from": ARQUS's own details, as printed on the PDF. */
  company: Company;
}

/** What the admin types; every figure is calculated by the server. */
export interface InvoiceInput {
  invoice_no: string;
  title: string;
  invoice_date: string;
  client_name: string;
  client_address: string;
  client_gstin: string;
  client_phone: string;
  client_email: string;
  tax_type: TaxType;
  gst_percent: string | null;
  items: InvoiceItem[];
}

export interface WhatsAppResult {
  url: string;
  text: string;
  link: string;
  invoice: Invoice;
}
