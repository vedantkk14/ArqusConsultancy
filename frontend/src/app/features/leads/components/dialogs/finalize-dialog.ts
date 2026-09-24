import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { InrPipe } from '../../../../shared/money/inr.pipe';
import { LeadDetail } from '../../data/lead.models';
import { LeadsApi } from '../../data/leads-api.service';
import { MoneyInput, isPositiveMoney } from '../money-input';

export interface FinalizeDialogData {
  lead: { id: number; name: string; proposed_amount: string | null };
}

/** Admin: confirm the final Total Amount for a won lead (stored on the accounts ledger). */
@Component({
  selector: 'app-finalize-dialog',
  imports: [FormsModule, InrPipe, MatButtonModule, MatDialogModule, MoneyInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  template: `
    <h2 mat-dialog-title>Finalize amount</h2>
    <p class="sub">{{ data.lead.name }} · proposed {{ data.lead.proposed_amount | inr }}</p>
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="fd-amount">Final amount</label>
        <app-money-input
          inputId="fd-amount"
          name="amount"
          [(ngModel)]="amount"
          [invalid]="!!amountError()"
          [describedBy]="amountError() ? 'fd-amount-err' : null"
        />
        @if (amountError()) {
          <p class="error" id="fd-amount-err">{{ amountError() }}</p>
        }
      </div>
      <div class="field">
        <label for="fd-note">Note (optional)</label>
        <textarea id="fd-note" name="note" [(ngModel)]="note"></textarea>
      </div>
      @if (notReady()) {
        <p class="note warn" role="alert">
          Finalizing isn't available yet: the accounts module still needs the ledger finalization step.
          Nothing was changed.
        </p>
      } @else if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Finalizing…' : 'Finalize' }}</button>
      </div>
    </form>
  `,
})
export class FinalizeDialog {
  protected readonly data = inject<FinalizeDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<FinalizeDialog, LeadDetail>);
  private readonly api = inject(LeadsApi);

  protected amount = this.data.lead.proposed_amount ?? '';
  protected note = '';
  protected readonly saving = signal(false);
  protected readonly amountError = signal('');
  protected readonly error = signal('');
  protected readonly notReady = signal(false);

  protected submit(): void {
    this.amountError.set(isPositiveMoney(this.amount) ? '' : 'Enter the final amount.');
    if (this.amountError()) {
      return;
    }
    this.saving.set(true);
    this.notReady.set(false);
    this.error.set('');
    this.api.finalize(this.data.lead.id, this.amount, this.note).subscribe({
      next: (lead) => this.ref.close(lead),
      error: (err: ApiError) => {
        this.saving.set(false);
        if (err.code === 'accounts_not_ready') {
          this.notReady.set(true);
        } else {
          this.error.set(err.message);
        }
      },
    });
  }
}
