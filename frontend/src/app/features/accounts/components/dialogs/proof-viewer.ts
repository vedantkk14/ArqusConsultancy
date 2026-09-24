import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { InrPipe } from '../../../../shared/money/inr.pipe';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { Payment } from '../../data/account.models';
import { AccountsApi } from '../../data/accounts-api.service';
import { DialogHead } from '../../ui/dialog-head';

export interface ProofViewerData {
  payment: Pick<Payment, 'id' | 'client' | 'receipt_no' | 'amount' | 'proof_kind'>;
}

/**
 * Shows a payment proof. The file is fetched with the user's token and shown from a blob URL: proofs have no
 * public URL, so nothing can be opened, shared or cached outside the app.
 */
@Component({
  selector: 'app-proof-viewer',
  imports: [DialogHead, ErrorState, InrPipe, MatButtonModule, MatDialogModule, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head
      headingId="dlg-title"
      title="Payment proof"
      [subtitle]="data.payment.client + ' · ' + data.payment.receipt_no + ' · ' + (data.payment.amount | inr: 'paise')"
      (closed)="ref.close()"
    />
    <div class="view">
      @if (failed()) {
        <app-error-state title="Couldn't load the proof" (retry)="load()" />
      } @else if (!url()) {
        <app-skeleton height="320px" radius="12px" />
      } @else if (isPdf()) {
        <iframe title="Payment proof PDF" [src]="url()!"></iframe>
      } @else {
        <img [src]="url()!" alt="Payment proof image" />
      }
    </div>
    <div class="actions">
      <span></span>
      <button matButton="filled" type="button" (click)="ref.close()">Close</button>
    </div>
  `,
  styles: `
    :host { width: min(720px, calc(100vw - 32px)); }
    .view { display: grid; min-height: 200px; place-items: center; overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: var(--subtle); }
    img { display: block; max-width: 100%; max-height: 65vh; object-fit: contain; }
    iframe { display: block; width: 100%; height: 65vh; border: 0; background: var(--surface); }
  `,
})
export class ProofViewer {
  protected readonly data = inject<ProofViewerData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ProofViewer, void>);
  private readonly api = inject(AccountsApi);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly url = signal<SafeResourceUrl | null>(null);
  protected readonly failed = signal(false);
  protected readonly isPdf = signal(this.data.payment.proof_kind === 'pdf');
  private objectUrl: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.proof(this.data.payment.id).subscribe({
      next: (blob) => {
        this.revoke();
        this.isPdf.set(blob.type === 'application/pdf');
        this.objectUrl = URL.createObjectURL(blob);
        // A blob URL made here from the API's own response: safe to trust as a resource URL.
        this.url.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
      },
      error: () => this.failed.set(true),
    });
  }

  private revoke(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
