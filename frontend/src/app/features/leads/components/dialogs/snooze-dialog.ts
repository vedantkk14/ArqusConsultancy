import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { atBusinessTime, toBusinessInput, toBusinessIso } from '../../utils/business-time';

/** Pick a follow-up date and time (IST). Closes with the ISO string. */
@Component({
  selector: 'app-snooze-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  template: `
    <h2 mat-dialog-title>Snooze follow-up</h2>
    <p class="sub">{{ data.name }}</p>
    <form (ngSubmit)="save()" novalidate>
      <div class="field">
        <label for="sn-at">Follow up on (IST)</label>
        <input id="sn-at" type="datetime-local" name="at" [(ngModel)]="value" [attr.aria-describedby]="error() ? 'sn-err' : null" />
        @if (error()) {
          <p class="error" id="sn-err">{{ error() }}</p>
        }
      </div>
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Snooze</button>
      </div>
    </form>
  `,
})
export class SnoozeDialog {
  protected readonly data = inject<{ name: string }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<SnoozeDialog, string>);
  protected value = toBusinessInput(atBusinessTime(1, 10));
  protected readonly error = signal('');

  protected save(): void {
    const iso = toBusinessIso(this.value);
    if (!iso || new Date(iso).getTime() < Date.now()) {
      this.error.set('Choose a time in the future.');
      return;
    }
    this.ref.close(iso);
  }
}
