import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { InrPipe } from '../../../../shared/money/inr.pipe';
import { ProjectDetail } from '../../data/project.models';
import { ProjectsApi } from '../../data/projects-api.service';
import { DialogHead } from '../../ui/dialog-head';
import { MoneyInput, isPositiveMoney } from '../../ui/money-input';
import { fieldError } from '../../ui/open';

export interface RequestBudgetDialogData {
  project: Pick<ProjectDetail, 'id' | 'name' | 'spent' | 'sanctioned_budget' | 'remaining'>;
}

/** PM: ask the Admin for more budget. The admin is notified and approves or rejects it. */
@Component({
  selector: 'app-request-budget-dialog',
  imports: [DialogHead, FormsModule, InrPipe, MatButtonModule, MatDialogModule, MoneyInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head headingId="dlg-title" title="Request more budget" [subtitle]="data.project.name" (closed)="ref.close()" />
    <p class="hint">
      Sanctioned {{ data.project.sanctioned_budget | inr }} · spent {{ data.project.spent | inr }}.
      The admin is notified and decides.
    </p>
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="rb-amount">Extra amount needed</label>
        <app-money-input inputId="rb-amount" name="amount" [(ngModel)]="amount" [invalid]="!!amountError()" />
        @if (amountError()) { <p class="error">{{ amountError() }}</p> }
      </div>
      <div class="field">
        <label for="rb-reason">Why is it needed?</label>
        <textarea id="rb-reason" name="reason" maxlength="500" [(ngModel)]="reason" [attr.aria-invalid]="reasonError() ? true : null"></textarea>
        @if (reasonError()) { <p class="error">{{ reasonError() }}</p> }
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <div class="actions">
        <button matButton type="button" (click)="ref.close()">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Sending…' : 'Send request' }}</button>
      </div>
    </form>
  `,
})
export class RequestBudgetDialog {
  protected readonly data = inject<RequestBudgetDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<RequestBudgetDialog, ProjectDetail>);
  private readonly api = inject(ProjectsApi);
  protected amount = this.data.project.remaining.startsWith('-') ? this.data.project.remaining.slice(1) : '';
  protected reason = '';
  protected readonly saving = signal(false);
  protected readonly amountError = signal('');
  protected readonly reasonError = signal('');
  protected readonly error = signal('');

  protected submit(): void {
    this.amountError.set(isPositiveMoney(this.amount) ? '' : 'Enter the extra amount.');
    this.reasonError.set(this.reason.trim() ? '' : 'Say why the extra budget is needed.');
    if (this.amountError() || this.reasonError() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.requestBudget(this.data.project.id, this.amount, this.reason.trim()).subscribe({
      next: (p) => this.ref.close(p),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.amountError.set(fieldError(err, 'amount'));
        this.reasonError.set(fieldError(err, 'reason'));
        if (!this.amountError() && !this.reasonError()) {
          this.error.set(err.message);
        }
      },
    });
  }
}
