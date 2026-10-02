import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ExportChoice } from '../../data/lead.models';
import { DialogHead } from './dialog-head';

export interface ExportDialogData {
  /** True when list filters are applied (they are kept in the export). */
  filtered: boolean;
}

/** "YYYY-MM" of today in Indian time (the business time zone). */
export function currentMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts['year']}-${parts['month']}`;
}

/** Export as Excel: all leads, or only those created in one month. Closes with the choice. */
@Component({
  selector: 'app-export-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  styles: `
    .choices { display: grid; gap: var(--space-2); margin: 0 0 var(--space-4); padding: 0; border: 0; }
    .choices legend { margin-bottom: var(--space-2); color: var(--ink-2); font-size: var(--text-sm); font-weight: 500; }
    .opt {
      display: flex; align-items: center; gap: var(--space-3); min-height: 44px; padding: 0 var(--space-3);
      border: 1px solid var(--line); border-radius: var(--radius-control); cursor: pointer;
    }
    .opt:has(input:checked) { border-color: var(--brand-deep); background: var(--brand-tint); }
    .opt input { accent-color: var(--brand-deep); }
    input[type='month'] {
      width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--line-strong);
      border-radius: var(--radius-control); font: inherit; color: var(--ink);
    }
  `,
  template: `
    <app-dialog-head title="Export as Excel" subtitle="Download the leads as an .xlsx workbook." />
    <form (ngSubmit)="submit()" novalidate>
      <fieldset class="choices">
        <legend>Which leads?</legend>
        <label class="opt"><input type="radio" name="scope" value="all" [(ngModel)]="scope" />All leads</label>
        <label class="opt"><input type="radio" name="scope" value="month" [(ngModel)]="scope" />A specific month</label>
      </fieldset>
      @if (scope === 'month') {
        <div class="field">
          <label for="ex-month">Leads created in</label>
          <input id="ex-month" type="month" name="month" [(ngModel)]="month" [attr.aria-invalid]="!!error()" />
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
        </div>
      }
      @if (data.filtered) {
        <p class="sub">The filters applied to the list are kept.</p>
      }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Download</button>
      </div>
    </form>
  `,
})
export class ExportDialog {
  protected readonly data = inject<ExportDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ExportDialog, ExportChoice>);
  protected scope: 'all' | 'month' = 'all';
  protected month = currentMonth();
  protected readonly error = signal('');

  protected submit(): void {
    if (this.scope === 'month' && !/^\d{4}-\d{2}$/.test(this.month)) {
      this.error.set('Choose a month.');
      return;
    }
    this.ref.close(this.scope === 'month' ? { scope: 'month', month: this.month } : { scope: 'all' });
  }
}
