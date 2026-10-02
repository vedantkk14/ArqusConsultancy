import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../core/models';
import { DialogHead } from '../../leads/components/dialogs/dialog-head';
import { LeaveRequestItem, LeaveSummary } from '../data/leave.models';
import { LeavesApi } from '../data/leaves-api.service';

export interface DecideDialogData {
  leave: LeaveRequestItem;
}

/** Admin: review an employee's leave history for this month/year, then approve or reject. */
@Component({
  selector: 'app-decide-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../leads/components/dialogs/dialog.scss',
  styles: `
    .req { margin: 0 0 var(--space-4); padding: 10px 12px; border-radius: var(--radius-control); background: var(--subtle); font-size: var(--text-sm); }
    .req p { margin: 0 0 4px; color: var(--ink-2); }
    .req p:last-child { margin-bottom: 0; }
    .hist { display: flex; gap: 16px; margin: 0 0 var(--space-4); font-size: var(--text-sm); color: var(--ink-2); }
    .hist strong { color: var(--ink); }
  `,
  template: `
    <app-dialog-head [title]="dialogTitle" [subtitle]="data.leave.start_date + ' to ' + data.leave.end_date + ' (' + data.leave.days + ' day(s))'" />
    <div class="req">
      <p><strong>Reason:</strong> {{ data.leave.reason }}</p>
    </div>
    @if (summary(); as s) {
      <p class="hist">
        <span><strong>{{ s.this_month }}</strong> day(s) taken this month</span>
        <span><strong>{{ s.this_year }}</strong> day(s) taken this year</span>
      </p>
    }
    <div class="field">
      <label for="dd-note">Note (optional)</label>
      <textarea id="dd-note" name="note" [(ngModel)]="note"></textarea>
    </div>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="actions">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <div style="display: flex; gap: 8px;">
        <button matButton="outlined" type="button" [disabled]="saving()" (click)="decide(false)">Reject</button>
        <button matButton="filled" type="button" [disabled]="saving()" (click)="decide(true)">Approve</button>
      </div>
    </div>
  `,
})
export class DecideDialog {
  protected readonly data = inject<DecideDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DecideDialog, LeaveRequestItem>);
  private readonly api = inject(LeavesApi);

  protected note = '';
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly summary = signal<LeaveSummary | null>(null);
  protected readonly dialogTitle = `Review ${this.data.leave.user.name}'s request`;

  constructor() {
    this.api.summary(this.data.leave.user.id).subscribe((s) => this.summary.set(s));
  }

  protected decide(approve: boolean): void {
    this.saving.set(true);
    this.error.set('');
    const call = approve ? this.api.approve(this.data.leave.id, this.note) : this.api.reject(this.data.leave.id, this.note);
    call.subscribe({
      next: (leave) => this.ref.close(leave),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
