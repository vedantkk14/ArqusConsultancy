import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../../core/models';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { computeTotals } from '../data/invoice-calc';
import { InvoiceInput, TaxType } from '../data/invoice.models';
import { InvoicesApi } from '../data/invoices-api.service';

interface FieldErrors {
  invoice_no?: string;
  invoice_date?: string;
  client_name?: string;
  client_email?: string;
  gst_percent?: string;
}

interface Row {
  particulars: string;
  hsn: string;
  quantity: string;
  unit: string;
  rate: string;
}

const blankRow = (): Row => ({ particulars: '', hsn: '', quantity: '', unit: 'Sq.ft', rate: '' });
const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Make a new invoice or edit one. Everything is typed by the admin; the totals are calculated. */
@Component({
  selector: 'app-invoice-form-page',
  imports: [ErrorState, FormsModule, InrPipe, MatButtonModule, MatIconModule, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; max-width: 980px; }
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: var(--space-3); color: var(--ink-2); font-size: var(--text-sm); text-decoration: none; }
    .card { margin-bottom: var(--space-5); padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
    h2 { margin: 0 0 var(--space-4); font-size: var(--text-lg); font-weight: 600; }
    .hint { margin: -8px 0 var(--space-4); color: var(--ink-3); font-size: var(--text-sm); }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 var(--space-4); }
    .grid .wide { grid-column: 1 / -1; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-4); min-width: 0; }
    label { color: var(--ink-2); font-size: var(--text-sm); font-weight: 500; }
    input, textarea, select {
      width: 100%; box-sizing: border-box; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line-strong);
      border-radius: var(--radius-control); background: var(--surface); color: var(--ink); font: inherit;
    }
    textarea { min-height: 84px; resize: vertical; }
    input[aria-invalid='true'], textarea[aria-invalid='true'] { border-color: var(--negative); }
    .err { margin: 0; color: var(--negative); font-size: var(--text-sm); }
    .item { margin-bottom: var(--space-4); padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--subtle); }
    .item-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); font-weight: 600; font-size: var(--text-sm); }
    .item-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 var(--space-3); }
    .item-grid .span { grid-column: 1 / -1; }
    .line-total { display: flex; justify-content: flex-end; color: var(--ink-2); font-size: var(--text-sm); }
    .line-total b { margin-left: 8px; color: var(--ink); font-variant-numeric: tabular-nums; }
    .rm { border: 0; background: transparent; color: var(--negative); cursor: pointer; font: inherit; font-size: var(--text-sm); }
    .summary { margin-left: auto; max-width: 380px; }
    .summary dl { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; margin: 0; font-size: var(--text-sm); }
    .summary dt { color: var(--ink-2); }
    .summary dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .summary .total { padding-top: 8px; border-top: 1px solid var(--line-strong); font-size: var(--text-md, 1rem); font-weight: 700; color: var(--ink); }
    .words { margin: var(--space-4) 0 0; color: var(--ink-2); font-size: var(--text-sm); font-style: italic; }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); justify-content: flex-end; }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
      .item-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
  template: `
    <a class="back" [routerLink]="editingId() ? ['/invoices', editingId()] : ['/invoices/all']">
      <mat-icon aria-hidden="true">arrow_back</mat-icon>{{ editingId() ? 'Back to the invoice' : 'All invoices' }}
    </a>

    @if (loadError()) {
      <app-error-state title="Couldn't load this invoice" (retry)="load()" />
    } @else if (loading()) {
      <app-skeleton height="320px" radius="12px" />
    } @else {
      <form (ngSubmit)="save()" novalidate>
        <section class="card">
          <h2>Invoice details</h2>
          <div class="grid">
            <div class="field">
              <label for="inv-no">Invoice number</label>
              <input id="inv-no" name="invoice_no" type="text" maxlength="60" autocomplete="off" placeholder="e.g. 2026-27/201"
                [(ngModel)]="invoiceNo" [attr.aria-invalid]="errors().invoice_no ? true : null" />
              @if (errors().invoice_no) { <p class="err">{{ errors().invoice_no }}</p> }
            </div>
            <div class="field">
              <label for="inv-date">Invoice date</label>
              <input id="inv-date" name="invoice_date" type="date" [(ngModel)]="invoiceDate" [attr.aria-invalid]="errors().invoice_date ? true : null" />
              @if (errors().invoice_date) { <p class="err">{{ errors().invoice_date }}</p> }
            </div>
            <div class="field wide">
              <label for="inv-title">Invoice name</label>
              <input id="inv-title" name="title" type="text" maxlength="200" autocomplete="off" placeholder="The project or job, e.g. Cycle track at Harmony Infra"
                [(ngModel)]="title" />
              <p class="hint" style="margin: 0">Shown in the list and used in emails. Leave blank to use the client name.</p>
            </div>
          </div>
        </section>

        <section class="card">
          <h2>Bill to / ship to</h2>
          <div class="grid">
            <div class="field wide">
              <label for="inv-client">Client or company name</label>
              <input id="inv-client" name="client_name" type="text" maxlength="150" autocomplete="off"
                [(ngModel)]="clientName" [attr.aria-invalid]="errors().client_name ? true : null" />
              @if (errors().client_name) { <p class="err">{{ errors().client_name }}</p> }
            </div>
            <div class="field wide">
              <label for="inv-address">Address</label>
              <textarea id="inv-address" name="client_address" maxlength="1000" [(ngModel)]="clientAddress"></textarea>
            </div>
            <div class="field">
              <label for="inv-gstin">Client GSTIN (optional)</label>
              <input id="inv-gstin" name="client_gstin" type="text" maxlength="20" autocomplete="off" [(ngModel)]="clientGstin" />
            </div>
            <div class="field">
              <label for="inv-phone">Phone (for WhatsApp)</label>
              <input id="inv-phone" name="client_phone" type="text" inputmode="tel" maxlength="20" autocomplete="off" [(ngModel)]="clientPhone" />
            </div>
            <div class="field wide">
              <label for="inv-email">Email (to send the invoice)</label>
              <input id="inv-email" name="client_email" type="email" maxlength="254" autocomplete="off"
                [(ngModel)]="clientEmail" [attr.aria-invalid]="errors().client_email ? true : null" />
              @if (errors().client_email) { <p class="err">{{ errors().client_email }}</p> }
            </div>
          </div>
        </section>

        <section class="card">
          <h2>Items</h2>
          @for (row of rows(); track $index; let i = $index) {
            <div class="item">
              <div class="item-head">
                <span>Item {{ i + 1 }}</span>
                @if (rows().length > 1) {
                  <button type="button" class="rm" (click)="removeRow(i)" [attr.aria-label]="'Remove item ' + (i + 1)">Remove</button>
                }
              </div>
              <div class="item-grid">
                <div class="field span">
                  <label [attr.for]="'it-part-' + i">Particulars</label>
                  <textarea [id]="'it-part-' + i" [name]="'part' + i" maxlength="2000" [(ngModel)]="row.particulars"
                    placeholder="Describe the work. Use a new line for each point." [attr.aria-invalid]="itemErrors()[i] ? true : null"></textarea>
                </div>
                <div class="field">
                  <label [attr.for]="'it-hsn-' + i">HSN</label>
                  <input [id]="'it-hsn-' + i" [name]="'hsn' + i" type="text" maxlength="20" [(ngModel)]="row.hsn" />
                </div>
                <div class="field">
                  <label [attr.for]="'it-qty-' + i">Quantity</label>
                  <input [id]="'it-qty-' + i" [name]="'qty' + i" type="text" inputmode="decimal" [(ngModel)]="row.quantity" (ngModelChange)="touch()" />
                </div>
                <div class="field">
                  <label [attr.for]="'it-unit-' + i">Unit</label>
                  <input [id]="'it-unit-' + i" [name]="'unit' + i" type="text" maxlength="20" [(ngModel)]="row.unit" />
                </div>
                <div class="field">
                  <label [attr.for]="'it-rate-' + i">Rate per unit</label>
                  <input [id]="'it-rate-' + i" [name]="'rate' + i" type="text" inputmode="decimal" [(ngModel)]="row.rate" (ngModelChange)="touch()" />
                </div>
              </div>
              @if (itemErrors()[i]) { <p class="err">{{ itemErrors()[i] }}</p> }
              <div class="line-total">Total <b>{{ totals().amounts[i] | inr: 'paise' }}</b></div>
            </div>
          }
          <button matButton="outlined" type="button" (click)="addRow()"><mat-icon>add</mat-icon>Add another item</button>
        </section>

        <section class="card">
          <h2>GST and total</h2>
          <div class="grid">
            <div class="field">
              <label for="inv-gst">GST %</label>
              <input id="inv-gst" name="gst_percent" type="text" inputmode="decimal" placeholder="Leave blank for no GST"
                [(ngModel)]="gstPercent" (ngModelChange)="touch()" [attr.aria-invalid]="errors().gst_percent ? true : null" />
              @if (errors().gst_percent) { <p class="err">{{ errors().gst_percent }}</p> }
            </div>
            <div class="field">
              <label for="inv-tax">GST type</label>
              <select id="inv-tax" name="tax_type" [(ngModel)]="taxType" (ngModelChange)="touch()">
                <option value="IGST">IGST (other state)</option>
                <option value="CGST_SGST">CGST + SGST (same state)</option>
              </select>
            </div>
          </div>
          <div class="summary" aria-live="polite">
            <dl>
              <dt>Sub total</dt><dd>{{ totals().subtotal | inr: 'paise' }}</dd>
              @if (hasTax()) {
                @if (taxType === 'CGST_SGST') {
                  <dt>CGST @ {{ halfPercent() }}%</dt><dd>{{ totals().cgst | inr: 'paise' }}</dd>
                  <dt>SGST @ {{ halfPercent() }}%</dt><dd>{{ totals().sgst | inr: 'paise' }}</dd>
                } @else {
                  <dt>IGST @ {{ gstPercent }}%</dt><dd>{{ totals().tax | inr: 'paise' }}</dd>
                }
              }
              @if (totals().roundOff !== '0.00') {
                <dt>Round off</dt><dd>{{ totals().roundOff | inr: 'paise' }}</dd>
              }
              <dt class="total">Total payable</dt><dd class="total">{{ totals().total | inr: 'paise' }}</dd>
            </dl>
          </div>
          <p class="words">In words: {{ totals().words }}</p>
        </section>

        @if (error()) { <p class="err" role="alert" style="margin-bottom: 12px">{{ error() }}</p> }
        <div class="actions">
          <a matButton [routerLink]="editingId() ? ['/invoices', editingId()] : ['/invoices/all']">Cancel</a>
          <button matButton="filled" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving…' : editingId() ? 'Save changes' : 'Generate invoice' }}
          </button>
        </div>
      </form>
    }
  `,
})
export class InvoiceFormPage {
  private readonly api = inject(InvoicesApi);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);

  protected readonly editingId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly errors = signal<FieldErrors>({});
  protected readonly itemErrors = signal<Record<number, string>>({});

  protected invoiceNo = '';
  protected invoiceDate = today();
  protected title = '';
  protected clientName = '';
  protected clientAddress = '';
  protected clientGstin = '';
  protected clientPhone = '';
  protected clientEmail = '';
  protected gstPercent = '';
  protected taxType: TaxType = 'IGST';
  protected readonly rows = signal<Row[]>([blankRow()]);
  private readonly version = signal(0);

  protected readonly totals = computed(() => {
    this.version();
    return computeTotals(this.rows(), this.gstPercent, this.taxType);
  });
  protected readonly hasTax = computed(() => {
    this.version();
    return Number(this.gstPercent) > 0;
  });
  protected readonly halfPercent = computed(() => {
    this.version();
    return String(Number(this.gstPercent) / 2);
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.editingId.set(id);
      this.load();
    }
  }

  protected touch(): void {
    this.version.update((v) => v + 1);
  }

  protected addRow(): void {
    this.rows.update((rows) => [...rows, blankRow()]);
  }

  protected removeRow(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
    this.touch();
  }

  load(): void {
    const id = this.editingId();
    if (!id) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(false);
    this.api.get(id).subscribe({
      next: (inv) => {
        this.invoiceNo = inv.invoice_no;
        this.invoiceDate = inv.invoice_date;
        this.title = inv.title;
        this.clientName = inv.client_name;
        this.clientAddress = inv.client_address;
        this.clientGstin = inv.client_gstin;
        this.clientPhone = inv.client_phone;
        this.clientEmail = inv.client_email;
        this.gstPercent = inv.gst_percent ? String(Number(inv.gst_percent)) : '';
        this.taxType = inv.tax_type;
        this.rows.set(
          inv.items.map((i) => ({
            particulars: i.particulars,
            hsn: i.hsn,
            quantity: String(Number(i.quantity)),
            unit: i.unit,
            rate: String(Number(i.rate)),
          })),
        );
        this.touch();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  private validate(): { fields: FieldErrors; items: Record<number, string> } {
    const fields: FieldErrors = {};
    const items: Record<number, string> = {};
    if (!this.invoiceNo.trim()) {
      fields.invoice_no = 'Enter the invoice number.';
    }
    if (!this.invoiceDate) {
      fields.invoice_date = 'Choose the invoice date.';
    }
    if (!this.clientName.trim()) {
      fields.client_name = 'Enter the client or company name.';
    }
    if (this.gstPercent.trim() && !(Number(this.gstPercent) >= 0 && Number(this.gstPercent) <= 100)) {
      fields.gst_percent = 'GST must be between 0 and 100.';
    }
    this.rows().forEach((row, i) => {
      if (!row.particulars.trim()) {
        items[i] = 'Describe this item.';
      } else if (!(Number(row.quantity) > 0)) {
        items[i] = 'Enter a quantity above zero.';
      } else if (row.rate.trim() === '' || !(Number(row.rate) >= 0)) {
        items[i] = 'Enter the rate per unit.';
      }
    });
    return { fields, items };
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    const { fields, items } = this.validate();
    this.errors.set(fields);
    this.itemErrors.set(items);
    this.error.set('');
    const firstField = (['invoice_no', 'invoice_date', 'client_name', 'gst_percent'] as const).find((k) => fields[k]);
    const firstItem = Object.keys(items)[0];
    if (firstField || firstItem !== undefined) {
      const ids = { invoice_no: 'inv-no', invoice_date: 'inv-date', client_name: 'inv-client', gst_percent: 'inv-gst' };
      document.getElementById(firstField ? ids[firstField] : `it-part-${firstItem}`)?.focus();
      return;
    }
    const body: InvoiceInput = {
      invoice_no: this.invoiceNo.trim(),
      title: this.title.trim(),
      invoice_date: this.invoiceDate,
      client_name: this.clientName.trim(),
      client_address: this.clientAddress.trim(),
      client_gstin: this.clientGstin.trim(),
      client_phone: this.clientPhone.trim(),
      client_email: this.clientEmail.trim(),
      tax_type: this.taxType,
      gst_percent: this.gstPercent.trim() ? this.gstPercent.trim() : null,
      items: this.rows().map((r) => ({
        particulars: r.particulars.trim(),
        hsn: r.hsn.trim(),
        quantity: r.quantity.trim(),
        rate: r.rate.trim(),
        unit: r.unit.trim(),
      })),
    };
    this.saving.set(true);
    const id = this.editingId();
    const request = id ? this.api.update(id, body) : this.api.create(body);
    request.subscribe({
      next: (invoice) => {
        this.snack.open(id ? 'Invoice updated.' : 'Invoice generated. You can send it now.', undefined, {
          duration: 4000,
        });
        void this.router.navigate(['/invoices', invoice.id]);
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.fail(err);
      },
    });
  }

  private fail(err: ApiError): void {
    const mapped: FieldErrors = {};
    for (const key of ['invoice_no', 'invoice_date', 'client_name', 'client_email', 'gst_percent'] as const) {
      const messages = err.details?.[key];
      if (Array.isArray(messages) && messages.length) {
        mapped[key] = String(messages[0]);
      }
    }
    if (Object.keys(mapped).length) {
      this.errors.set(mapped);
      document.getElementById(mapped.invoice_no ? 'inv-no' : 'inv-client')?.focus();
    } else {
      this.error.set(err.message);
    }
  }
}
