import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { InvoicePaper } from '../components/invoice-paper';
import {
  EmailInvoiceDialog,
  SendInvoiceData,
  WhatsAppInvoiceDialog,
} from '../components/send-invoice-dialogs';
import { Invoice } from '../data/invoice.models';
import { InvoicesApi } from '../data/invoices-api.service';

/** One invoice: a replica of the page the client gets, and the buttons to send it. */
@Component({
  selector: 'app-invoice-detail-page',
  imports: [ErrorState, InrPipe, InvoicePaper, MatButtonModule, MatIconModule, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: var(--space-3); color: var(--ink-2); font-size: var(--text-sm); text-decoration: none; }
    .card { margin-bottom: var(--space-5); padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
    .top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
    h1 { margin: 0; font-size: var(--text-xl, 1.4rem); font-weight: 600; }
    .sub { margin: 4px 0 0; color: var(--ink-3); font-size: var(--text-sm); }
    .amount { text-align: right; }
    .amount b { display: block; font-size: var(--text-xl, 1.4rem); font-variant-numeric: tabular-nums; }
    .amount span { color: var(--ink-3); font-size: var(--text-xs); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: var(--space-3); }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 0 10px; border-radius: var(--radius-pill); background: var(--tint-teal); color: var(--tint-teal-ink); font-size: var(--text-xs); line-height: 24px; font-weight: 600; }
    .chip.none { background: var(--subtle); color: var(--ink-3); font-weight: 500; }
    .chip mat-icon { width: 14px; height: 14px; font-size: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-4); }
    .preview { padding: 0; border: 0; background: transparent; }
    .preview-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
    .preview-head h2 { margin: 0; font-size: var(--text-md, 1rem); font-weight: 600; }
    .pdf-note { margin: var(--space-3) 0 0; color: var(--ink-2); font-size: var(--text-sm); }
    .retry { border: 0; background: none; padding: 0; color: var(--brand-deep); font: inherit; text-decoration: underline; cursor: pointer; }
  `,
  template: `
    <a class="back" routerLink="/invoices/all"><mat-icon aria-hidden="true">arrow_back</mat-icon>All invoices</a>

    @if (loadError()) {
      <app-error-state title="Couldn't load this invoice" (retry)="load()" />
    } @else if (invoice(); as inv) {
      <section class="card">
        <div class="top">
          <div>
            <h1>Invoice {{ inv.invoice_no }}</h1>
            <p class="sub">{{ inv.title }} · {{ inv.client_name }} · {{ day(inv.invoice_date) }}</p>
          </div>
          <div class="amount">
            <b>{{ inv.total | inr: 'paise' }}</b>
            <span>Total payable</span>
          </div>
        </div>
        <div class="chips" aria-label="Sent status">
          @if (inv.emailed_at) { <span class="chip"><mat-icon aria-hidden="true">mail</mat-icon>Emailed {{ when(inv.emailed_at) }}</span> }
          @if (inv.whatsapp_at) { <span class="chip"><mat-icon aria-hidden="true">chat</mat-icon>WhatsApp {{ when(inv.whatsapp_at) }}</span> }
          @if (!inv.emailed_at && !inv.whatsapp_at) { <span class="chip none">Not sent yet</span> }
        </div>
        <div class="actions">
          <button matButton="filled" type="button" (click)="sendEmail(inv)" aria-label="Send to client by email">
            <mat-icon>mail</mat-icon>Send by email
          </button>
          <button matButton="filled" type="button" (click)="sendWhatsApp(inv)" aria-label="Send to client on WhatsApp">
            <mat-icon>chat</mat-icon>Send on WhatsApp
          </button>
          <button matButton="outlined" type="button" (click)="download(inv)" [disabled]="!blob()" aria-label="Download PDF">
            <mat-icon>download</mat-icon>Download PDF
          </button>
          <a matButton="outlined" [routerLink]="['/invoices', inv.id, 'edit']" aria-label="Edit invoice">
            <mat-icon>edit</mat-icon>Edit
          </a>
        </div>
      </section>

      <section class="preview">
        <div class="preview-head">
          <h2>Invoice preview</h2>
          <button matButton type="button" (click)="openFull()" [disabled]="!blob()" aria-label="Open the PDF full size">
            <mat-icon>open_in_new</mat-icon>Open full size
          </button>
        </div>
        <app-invoice-paper [invoice]="inv" />
        @if (pdfError()) {
          <p class="pdf-note" role="status">
            The PDF file could not be prepared just now.
            <button type="button" class="retry" (click)="loadPdf(inv.id)">Try again</button>
          </p>
        }
      </section>
    } @else {
      <app-skeleton height="160px" radius="12px" />
    }
  `,
})
export class InvoiceDetailPage {
  private readonly api = inject(InvoicesApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly loadError = signal(false);
  protected readonly pdfError = signal(false);
  protected readonly blob = signal<Blob | null>(null);
  constructor() {
    this.load();
  }

  /** The browser's own viewer, for zooming or printing. */
  protected openFull(): void {
    const blob = this.blob();
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  load(): void {
    this.loadError.set(false);
    this.api.get(this.id).subscribe({
      next: (inv) => {
        this.invoice.set(inv);
        this.loadPdf(inv.id);
      },
      error: () => this.loadError.set(true),
    });
  }

  loadPdf(id: number): void {
    this.pdfError.set(false);
    this.api.pdf(id).subscribe({
      next: (blob) => this.blob.set(blob),
      error: () => this.pdfError.set(true),
    });
  }

  protected day(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  protected download(inv: Invoice): void {
    const blob = this.blob();
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice-${inv.invoice_no.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected sendEmail(inv: Invoice): void {
    this.dialog
      .open<EmailInvoiceDialog, SendInvoiceData, { sent_to: string; invoice: Invoice }>(EmailInvoiceDialog, {
        data: { invoice: inv },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.invoice.set(res.invoice);
          this.snack.open(`Invoice emailed to ${res.sent_to}.`, undefined, { duration: 5000 });
        }
      });
  }

  protected sendWhatsApp(inv: Invoice): void {
    this.dialog
      .open<WhatsAppInvoiceDialog, SendInvoiceData, Invoice>(WhatsAppInvoiceDialog, { data: { invoice: inv } })
      .afterClosed()
      .subscribe((updated) => {
        if (updated) {
          this.invoice.set(updated);
          this.snack.open('WhatsApp opened with the invoice message. Press Send there to deliver it.', undefined, {
            duration: 6000,
          });
        }
      });
  }
}
