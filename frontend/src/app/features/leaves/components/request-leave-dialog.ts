import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../core/models';
import { DialogHead } from '../../leads/components/dialogs/dialog-head';
import { LeaveRequestItem } from '../data/leave.models';
import { LeavesApi } from '../data/leaves-api.service';

/** Pick dates and give a reason; the request goes to the admin to approve or reject. */
@Component({
  selector: 'app-request-leave-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../leads/components/dialogs/dialog.scss',
  template: `
    <app-dialog-head title="Request leave" subtitle="Sent to the admin for approval." />
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="rl-start">From</label>
        <input id="rl-start" type="date" name="start" [(ngModel)]="start" required />
      </div>
      <div class="field">
        <label for="rl-end">To</label>
        <input id="rl-end" type="date" name="end" [(ngModel)]="end" required />
      </div>
      <div class="field">
        <label for="rl-reason">Reason</label>
        <textarea id="rl-reason" name="reason" [(ngModel)]="reason" placeholder="Why do you need this leave?"></textarea>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Sending…' : 'Send request' }}</button>
      </div>
    </form>
  `,
})
export class RequestLeaveDialog {
  private readonly ref = inject(MatDialogRef<RequestLeaveDialog, LeaveRequestItem>);
  private readonly api = inject(LeavesApi);

  protected start = '';
  protected end = '';
  protected reason = '';
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    if (!this.start || !this.end) {
      this.error.set('Choose both dates.');
      return;
    }
    if (!this.reason.trim()) {
      this.error.set('Enter a reason for the leave.');
      return;
    }
    if (this.end < this.start) {
      this.error.set('The end date must be on or after the start date.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.request({ start_date: this.start, end_date: this.end, reason: this.reason.trim() }).subscribe({
      next: (leave) => this.ref.close(leave),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
