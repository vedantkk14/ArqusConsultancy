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

export interface BudgetDialogData {
  project: Pick<ProjectDetail, 'id' | 'name' | 'spent' | 'sanctioned_budget'>;
  /** The deal total, when accounts can say. It is the ceiling for the budget. */
  max?: string | null;
}

/** Admin: change the sanctioned budget. A reason is required; the budget can't go below what is spent. */
@Component({
  selector: 'app-budget-dialog',
  imports: [DialogHead, FormsModule, InrPipe, MatButtonModule, MatDialogModule, MoneyInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head
      headingId="dlg-title"
      title="Adjust budget"
      [subtitle]="data.project.name + ' · now ' + (data.project.sanctioned_budget | inr)"
      (closed)="ref.close()"
    />
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="bd-amount">New sanctioned budget</label>
        <app-money-input
          inputId="bd-amount"
          name="amount"
          [(ngModel)]="amount"
          [invalid]="!!amountError()"
          [describedBy]="'bd-amount-hint' + (amountError() ? ' bd-amount-err' : '')"
        />
        <p class="hint" id="bd-amount-hint">
          Already spent {{ data.project.spent | inr }}.
          @if (data.max) {
            Cannot exceed {{ data.max | inr }}.
          }
        </p>
        @if (amountError()) {
          <p class="error" id="bd-amount-err">{{ amountError() }}</p>
        }
      </div>
      <div class="field">
        <label for="bd-reason">Reason</label>
        <textarea
          id="bd-reason"
          name="reason"
          maxlength="300"
          [(ngModel)]="reason"
          [attr.aria-invalid]="reasonError() ? true : null"
          [attr.aria-describedby]="reasonError() ? 'bd-reason-err' : null"
        ></textarea>
        @if (reasonError()) {
          <p class="error" id="bd-reason-err">{{ reasonError() }}</p>
        }
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" (click)="ref.close()">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save budget' }}</button>
      </div>
    </form>
  `,
})
export class BudgetDialog {
  protected readonly data = inject<BudgetDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<BudgetDialog, ProjectDetail>);
  private readonly api = inject(ProjectsApi);

  protected amount = this.data.project.sanctioned_budget;
  protected reason = '';
  protected readonly saving = signal(false);
  protected readonly amountError = signal('');
  protected readonly reasonError = signal('');
  protected readonly error = signal('');

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    this.amountError.set(isPositiveMoney(this.amount) ? '' : 'Enter the new budget.');
    this.reasonError.set(this.reason.trim() ? '' : 'Give a reason for the change.');
    if (this.amountError() || this.reasonError()) {
      document.getElementById(this.amountError() ? 'bd-amount' : 'bd-reason')?.focus();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.changeBudget(this.data.project.id, this.amount, this.reason.trim()).subscribe({
      next: (project) => this.ref.close(project),
      error: (err: ApiError) => {
        this.saving.set(false);
        const budget = fieldError(err, 'sanctioned_budget');
        const reason = fieldError(err, 'reason');
        if (err.code === 'budget_below_spent' || err.code === 'budget_exceeds_total' || budget) {
          this.amountError.set(budget || err.message);
        } else if (reason) {
          this.reasonError.set(reason);
        } else {
          this.error.set(err.message);
        }
      },
    });
  }
}
