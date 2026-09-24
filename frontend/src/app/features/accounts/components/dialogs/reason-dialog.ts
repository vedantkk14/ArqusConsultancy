import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { ApiError } from '../../../../core/models';
import { DialogHead } from '../../ui/dialog-head';
import { fieldError } from '../../ui/open';

export interface ReasonDialogData<T = unknown> {
  title: string;
  subtitle: string;
  /** Label above the box, e.g. "Why are you reopening it?". */
  prompt: string;
  confirmText: string;
  /** Runs the API call; a failure is shown inline and the dialog stays open. */
  action: (reason: string) => Observable<T>;
}

/** A reason (required) plus Cancel / confirm. Used to void an expense and to reopen a project. */
@Component({
  selector: 'app-reason-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head headingId="dlg-title" [title]="data.title" [subtitle]="data.subtitle" (closed)="ref.close()" />
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="rd-reason">{{ data.prompt }}</label>
        <textarea
          id="rd-reason"
          name="reason"
          maxlength="300"
          [(ngModel)]="reason"
          [attr.aria-invalid]="reasonError() ? true : null"
          [attr.aria-describedby]="reasonError() ? 'rd-reason-err' : null"
        ></textarea>
        @if (reasonError()) {
          <p class="error" id="rd-reason-err">{{ reasonError() }}</p>
        }
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" (click)="ref.close()">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : data.confirmText }}</button>
      </div>
    </form>
  `,
})
export class ReasonDialog {
  protected readonly data = inject<ReasonDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ReasonDialog, unknown>);

  protected reason = '';
  protected readonly saving = signal(false);
  protected readonly reasonError = signal('');
  protected readonly error = signal('');

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    this.reasonError.set(this.reason.trim() ? '' : 'Give a reason.');
    if (this.reasonError()) {
      document.getElementById('rd-reason')?.focus();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.data.action(this.reason.trim()).subscribe({
      next: (result) => this.ref.close(result ?? true),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.reasonError.set(fieldError(err, 'reason'));
        this.error.set(this.reasonError() ? '' : err.message);
      },
    });
  }
}
