import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ApiError } from '../../../core/models';
import { DialogHead } from '../../leads/components/dialogs/dialog-head';
import { Holiday } from '../data/leave.models';
import { LeavesApi } from '../data/leaves-api.service';

export interface HolidayDialogData {
  date?: string;
}

/** Admin only: add a day to the standard holiday calendar. */
@Component({
  selector: 'app-holiday-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../leads/components/dialogs/dialog.scss',
  template: `
    <app-dialog-head title="Add holiday" subtitle="Visible to the whole team on the standard calendar." />
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="hd-date">Date</label>
        <input id="hd-date" type="date" name="date" [(ngModel)]="date" required />
      </div>
      <div class="field">
        <label for="hd-name">Name</label>
        <input id="hd-name" type="text" name="name" [(ngModel)]="name" placeholder="e.g. Diwali" />
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Adding…' : 'Add holiday' }}</button>
      </div>
    </form>
  `,
})
export class HolidayDialog {
  private readonly ref = inject(MatDialogRef<HolidayDialog, Holiday>);
  private readonly data = inject<HolidayDialogData>(MAT_DIALOG_DATA, { optional: true });
  private readonly api = inject(LeavesApi);

  protected date = this.data?.date ?? '';
  protected name = '';
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    if (!this.date || !this.name.trim()) {
      this.error.set('Enter a date and a name.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.addHoliday({ date: this.date, name: this.name.trim() }).subscribe({
      next: (holiday) => this.ref.close(holiday),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
