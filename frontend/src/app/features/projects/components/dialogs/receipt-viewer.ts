import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { InrPipe } from '../../../../shared/money/inr.pipe';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { Expense } from '../../data/project.models';
import { ProjectsApi } from '../../data/projects-api.service';
import { DialogHead } from '../../ui/dialog-head';

export interface ReceiptViewerData {
  expense: Pick<Expense, 'id' | 'category_label' | 'vendor' | 'amount' | 'receipt_kind'>;
}

/**
 * Shows a receipt. The file is fetched with the user's token and shown from a blob URL: receipts have no
 * public URL, so nothing can be opened, shared or cached outside the app.
 */
@Component({
  selector: 'app-receipt-viewer',
  imports: [DialogHead, ErrorState, InrPipe, MatButtonModule, MatDialogModule, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head
      headingId="dlg-title"
      title="Receipt"
      [subtitle]="data.expense.category_label + (data.expense.vendor ? ' · ' + data.expense.vendor : '') + ' · ' + (data.expense.amount | inr: 'paise')"
      (closed)="ref.close()"
    />
    <div class="view">
      @if (failed()) {
        <app-error-state title="Couldn't load the receipt" (retry)="load()" />
      } @else if (!url()) {
        <app-skeleton height="320px" radius="12px" />
      } @else if (isPdf()) {
        <iframe title="Receipt PDF" [src]="url()!"></iframe>
      } @else {
        <img [src]="url()!" alt="Receipt image" />
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
export class ReceiptViewer {
  protected readonly data = inject<ReceiptViewerData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ReceiptViewer, void>);
  private readonly api = inject(ProjectsApi);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly url = signal<SafeResourceUrl | null>(null);
  protected readonly failed = signal(false);
  protected readonly isPdf = signal(this.data.expense.receipt_kind === 'pdf');
  private objectUrl: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.receipt(this.data.expense.id).subscribe({
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
