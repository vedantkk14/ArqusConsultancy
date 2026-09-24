import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { LOST_REASONS, LeadDetail, LeadStatus, LostReason, STATUS_LABELS, StatusChange } from '../../data/lead.models';
import { LeadsApi } from '../../data/leads-api.service';
import { toBusinessIso } from '../../utils/business-time';
import { MoneyInput, isPositiveMoney } from '../money-input';

export interface StatusDialogData {
  lead: { id: number; name: string; proposed_amount: string | null };
  to: LeadStatus;
}

/** Status change: Won needs a value, Lost needs a reason, the rest take an optional note and follow-up. */
@Component({
  selector: 'app-status-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MoneyInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  template: `
    <h2 mat-dialog-title>Mark as {{ label }}</h2>
    <p class="sub">{{ data.lead.name }}</p>
    <form (ngSubmit)="submit()" novalidate>
      @if (data.to === 'WON') {
        <p class="note">This creates the client's account ledger and notifies the admin.</p>
        <div class="field">
          <label for="sd-amount">Proposed value</label>
          <app-money-input
            inputId="sd-amount"
            name="amount"
            [(ngModel)]="amount"
            [invalid]="!!errors()['proposed_amount']"
            [describedBy]="errors()['proposed_amount'] ? 'sd-amount-err' : null"
          />
          @if (errors()['proposed_amount']) {
            <p class="error" id="sd-amount-err">{{ errors()['proposed_amount'] }}</p>
          }
        </div>
      } @else if (data.to === 'LOST') {
        <div class="field">
          <label for="sd-reason">Reason</label>
          <select
            id="sd-reason"
            name="reason"
            [(ngModel)]="reason"
            [attr.aria-invalid]="!!errors()['lost_reason'] || null"
            [attr.aria-describedby]="errors()['lost_reason'] ? 'sd-reason-err' : null"
          >
            <option value="">Choose a reason</option>
            @for (r of reasons; track r[0]) {
              <option [value]="r[0]">{{ r[1] }}</option>
            }
          </select>
          @if (errors()['lost_reason']) {
            <p class="error" id="sd-reason-err">{{ errors()['lost_reason'] }}</p>
          }
        </div>
        <div class="field">
          <label for="sd-lost-note">Note (optional)</label>
          <textarea id="sd-lost-note" name="lostNote" [(ngModel)]="note"></textarea>
        </div>
      } @else {
        <div class="field">
          <label for="sd-note">Note (optional)</label>
          <textarea id="sd-note" name="note" [(ngModel)]="note"></textarea>
        </div>
        <div class="field">
          <label for="sd-fu">Next follow-up (optional, IST)</label>
          <input id="sd-fu" type="datetime-local" name="fu" [(ngModel)]="followup" />
          @if (errors()['next_followup_at']) {
            <p class="error">{{ errors()['next_followup_at'] }}</p>
          }
        </div>
      }
      @if (errors()['form']) {
        <p class="error" role="alert">{{ errors()['form'] }}</p>
      }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Mark as ' + label }}</button>
      </div>
    </form>
  `,
})
export class StatusDialog {
  protected readonly data = inject<StatusDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<StatusDialog, LeadDetail>);
  private readonly api = inject(LeadsApi);

  protected readonly label = STATUS_LABELS[this.data.to];
  protected readonly reasons = LOST_REASONS;
  protected amount = this.data.lead.proposed_amount ?? '';
  protected reason: LostReason | '' = '';
  protected note = '';
  protected followup = '';
  protected readonly saving = signal(false);
  protected readonly errors = signal<Record<string, string>>({});

  protected submit(): void {
    const errors: Record<string, string> = {};
    if (this.data.to === 'WON' && !isPositiveMoney(this.amount)) {
      errors['proposed_amount'] = 'Enter the proposed value.';
    }
    if (this.data.to === 'LOST' && !this.reason) {
      errors['lost_reason'] = 'Choose why this lead was lost.';
    }
    this.errors.set(errors);
    if (Object.keys(errors).length) {
      return;
    }
    const body: StatusChange = { status: this.data.to };
    if (this.data.to === 'WON') {
      body.proposed_amount = this.amount;
    } else if (this.data.to === 'LOST') {
      body.lost_reason = this.reason as LostReason;
      body.lost_note = this.note;
    } else {
      body.note = this.note;
      body.next_followup_at = this.followup ? toBusinessIso(this.followup) : undefined;
    }
    this.saving.set(true);
    this.api.changeStatus(this.data.lead.id, body).subscribe({
      next: (lead) => this.ref.close(lead),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.errors.set(serverErrors(err));
      },
    });
  }
}

/** API error -> {field: message}; anything not tied to a field goes under "form". */
export function serverErrors(err: ApiError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(err.details ?? {})) {
    if (Array.isArray(value) && typeof value[0] === 'string') {
      out[key] = value[0];
    }
  }
  if (err.code === 'followup_in_past') {
    out['next_followup_at'] = 'The follow-up must not be in the past.';
  } else if (!Object.keys(out).length) {
    out['form'] = err.message;
  }
  return out;
}
