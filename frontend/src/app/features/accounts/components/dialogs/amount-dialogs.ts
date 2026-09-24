import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { InrPipe } from '../../../../shared/money/inr.pipe';
import { LedgerDetail } from '../../data/account.models';
import { AccountsApi } from '../../data/accounts-api.service';
import { DialogHead } from '../../ui/dialog-head';
import { MoneyInput, isPositiveMoney } from '../../ui/money-input';
import { fieldError } from '../../ui/open';

export interface AmountDialogData {
  ledger: Pick<LedgerDetail, 'id' | 'client' | 'total' | 'received'> & { proposed_amount?: string | null };
}

/** Admin: confirm the final Total Amount of a won deal. Finalizing twice shows a clear message, no crash. */
@Component({
  selector: 'app-finalize-dialog',
  imports: [DialogHead, FormsModule, InrPipe, MatButtonModule, MatDialogModule, MoneyInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head
      headingId="dlg-title"
      title="Finalize amount"
      [subtitle]="data.ledger.client + ' · proposed ' + ((data.ledger.proposed_amount ?? data.ledger.total) | inr)"
      (closed)="ref.close()"
    />
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="fz-amount">Final amount</label>
        <app-money-input inputId="fz-amount" name="amount" [(ngModel)]="amount" [invalid]="!!amountError()" [describedBy]="amountError() ? 'fz-amount-err' : null" />
        <p class="hint">Payments can be recorded once the amount is final.</p>
        @if (amountError()) {
          <p class="error" id="fz-amount-err">{{ amountError() }}</p>
        }
      </div>
      <div class="field">
        <label for="fz-note">Note (optional)</label>
        <textarea id="fz-note" name="note" maxlength="300" [(ngModel)]="note"></textarea>
      </div>
      @if (already()) {
        <p class="note warn" role="alert">This deal is already finalized. Refresh the page to see the final amount.</p>
      } @else if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" (click)="ref.close(already())">{{ already() ? 'Close' : 'Cancel' }}</button>
        <button matButton="filled" type="submit" [disabled]="saving() || already()">{{ saving() ? 'Finalizing…' : 'Confirm' }}</button>
      </div>
    </form>
  `,
})
export class FinalizeDialog {
  protected readonly data = inject<AmountDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<FinalizeDialog, LedgerDetail | boolean>);
  private readonly api = inject(AccountsApi);

  protected amount = this.data.ledger.proposed_amount ?? this.data.ledger.total;
  protected note = '';
  protected readonly saving = signal(false);
  protected readonly amountError = signal('');
  protected readonly error = signal('');
  protected readonly already = signal(false);

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    this.amountError.set(isPositiveMoney(this.amount) ? '' : 'Enter the final amount.');
    if (this.amountError()) {
      document.getElementById('fz-amount')?.focus();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.finalize(this.data.ledger.id, this.amount, this.note.trim()).subscribe({
      next: (ledger) => this.ref.close(ledger),
      error: (err: ApiError) => {
        this.saving.set(false);
        if (err.code === 'already_finalized') {
          this.already.set(true);
        } else {
          this.amountError.set(fieldError(err, 'amount'));
          this.error.set(this.amountError() ? '' : err.message);
        }
      },
    });
  }
}

/** Admin: change the total after finalization. A reason is required; never below what was received. */
@Component({
  selector: 'app-revise-total-dialog',
  imports: [DialogHead, FormsModule, InrPipe, MatButtonModule, MatDialogModule, MoneyInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head
      headingId="dlg-title"
      title="Revise total"
      [subtitle]="data.ledger.client + ' · now ' + (data.ledger.total | inr)"
      (closed)="ref.close()"
    />
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="rv-amount">New total</label>
        <app-money-input inputId="rv-amount" name="amount" [(ngModel)]="amount" [invalid]="!!amountError()" [describedBy]="'rv-hint' + (amountError() ? ' rv-amount-err' : '')" />
        <p class="hint" id="rv-hint">Already received {{ data.ledger.received | inr }}. The total cannot go below that, or below the project's sanctioned budget.</p>
        @if (amountError()) {
          <p class="error" id="rv-amount-err">{{ amountError() }}</p>
        }
      </div>
      <div class="field">
        <label for="rv-reason">Reason</label>
        <textarea id="rv-reason" name="reason" maxlength="300" [(ngModel)]="reason" [attr.aria-invalid]="reasonError() ? true : null"></textarea>
        @if (reasonError()) {
          <p class="error">{{ reasonError() }}</p>
        }
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" (click)="ref.close()">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save total' }}</button>
      </div>
    </form>
  `,
})
export class ReviseTotalDialog {
  protected readonly data = inject<AmountDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ReviseTotalDialog, LedgerDetail>);
  private readonly api = inject(AccountsApi);

  protected amount = this.data.ledger.total;
  protected reason = '';
  protected readonly saving = signal(false);
  protected readonly amountError = signal('');
  protected readonly reasonError = signal('');
  protected readonly error = signal('');

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    this.amountError.set(isPositiveMoney(this.amount) ? '' : 'Enter the new total.');
    this.reasonError.set(this.reason.trim() ? '' : 'Give a reason for the change.');
    if (this.amountError() || this.reasonError()) {
      document.getElementById(this.amountError() ? 'rv-amount' : 'rv-reason')?.focus();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.reviseTotal(this.data.ledger.id, this.amount, this.reason.trim()).subscribe({
      next: (ledger) => this.ref.close(ledger),
      error: (err: ApiError) => {
        this.saving.set(false);
        const amount = fieldError(err, 'amount');
        const reason = fieldError(err, 'reason');
        if (err.code === 'total_below_received' || err.code === 'total_below_budget' || amount) {
          this.amountError.set(amount || err.message);
        } else if (reason) {
          this.reasonError.set(reason);
        } else {
          this.error.set(err.message);
        }
      },
    });
  }
}
