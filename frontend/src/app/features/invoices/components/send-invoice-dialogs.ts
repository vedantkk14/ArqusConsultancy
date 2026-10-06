import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../core/models';
import { DialogHead } from '../../leads/components/dialogs/dialog-head';
import { Invoice } from '../data/invoice.models';
import { InvoicesApi } from '../data/invoices-api.service';

export interface SendInvoiceData {
  invoice: Pick<Invoice, 'id' | 'invoice_no' | 'client_name' | 'client_email' | 'client_phone'>;
}

/** Email the invoice to the client as a PDF attachment. */
@Component({
  selector: 'app-email-invoice-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../leads/components/dialogs/dialog.scss',
  styles: `.hint { margin: 0; color: var(--ink-3); font-size: var(--text-xs); }`,
  template: `
    <app-dialog-head
      title="Send by email"
      [subtitle]="'Invoice ' + data.invoice.invoice_no + ' goes to ' + data.invoice.client_name + ' as a PDF attachment.'"
    />
    <form (ngSubmit)="send()" novalidate>
      <div class="field">
        <label for="ei-to">Send to</label>
        <input id="ei-to" name="to" type="text" inputmode="email" autocomplete="off" [(ngModel)]="to" />
        <p class="hint">Change it to send to a different address.</p>
      </div>
      <div class="field">
        <label for="ei-msg">Message (optional)</label>
        <textarea id="ei-msg" name="message" maxlength="2000" [(ngModel)]="message" placeholder="Added under the invoice details."></textarea>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="sending()">{{ sending() ? 'Sending…' : 'Send email' }}</button>
      </div>
    </form>
  `,
})
export class EmailInvoiceDialog {
  protected readonly data = inject<SendInvoiceData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EmailInvoiceDialog, { sent_to: string; invoice: Invoice }>);
  private readonly api = inject(InvoicesApi);

  protected to = this.data.invoice.client_email;
  protected message = '';
  protected readonly sending = signal(false);
  protected readonly error = signal('');

  protected send(): void {
    if (this.sending()) {
      return;
    }
    if (!this.to.trim()) {
      this.error.set("Enter the client's email address.");
      return;
    }
    this.sending.set(true);
    this.error.set('');
    this.api.email(this.data.invoice.id, { to: this.to.trim(), message: this.message.trim() }).subscribe({
      next: (res) => this.ref.close(res),
      error: (err: ApiError) => {
        this.sending.set(false);
        this.error.set(err.details?.['to'] ? String((err.details['to'] as string[])[0]) : err.message);
      },
    });
  }
}

/** Open WhatsApp with the invoice message and a private link to the PDF. */
@Component({
  selector: 'app-whatsapp-invoice-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../leads/components/dialogs/dialog.scss',
  styles: `.hint { margin: 0; color: var(--ink-3); font-size: var(--text-xs); }`,
  template: `
    <app-dialog-head
      title="Send on WhatsApp"
      [subtitle]="'Invoice ' + data.invoice.invoice_no + ' for ' + data.invoice.client_name"
    />
    <form (ngSubmit)="send()" novalidate>
      <div class="field">
        <label for="wi-phone">WhatsApp number</label>
        <input id="wi-phone" name="phone" type="text" inputmode="tel" autocomplete="off" placeholder="e.g. 98765 43210" [(ngModel)]="phone" />
        <p class="hint">
          WhatsApp opens with the message ready. It includes a private link to the PDF that works for 30 days,
          because WhatsApp cannot attach a file from a link.
        </p>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="sending()">{{ sending() ? 'Opening…' : 'Open WhatsApp' }}</button>
      </div>
    </form>
  `,
})
export class WhatsAppInvoiceDialog {
  protected readonly data = inject<SendInvoiceData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<WhatsAppInvoiceDialog, Invoice>);
  private readonly api = inject(InvoicesApi);

  protected phone = this.data.invoice.client_phone;
  protected readonly sending = signal(false);
  protected readonly error = signal('');

  protected send(): void {
    if (this.sending()) {
      return;
    }
    if (!this.phone.trim()) {
      this.error.set("Enter the client's WhatsApp number.");
      return;
    }
    // Open the tab inside the click (popup blockers), then point it at the wa.me link.
    const tab = window.open('', '_blank');
    this.sending.set(true);
    this.error.set('');
    this.api.whatsapp(this.data.invoice.id, { phone: this.phone.trim() }).subscribe({
      next: (res) => {
        if (tab) {
          tab.opener = null;
          tab.location.href = res.url;
        } else {
          window.open(res.url, '_blank', 'noopener');
        }
        this.ref.close(res.invoice);
      },
      error: (err: ApiError) => {
        tab?.close();
        this.sending.set(false);
        this.error.set(err.code === 'no_recipient' ? 'Enter a valid WhatsApp number.' : err.message);
      },
    });
  }
}
