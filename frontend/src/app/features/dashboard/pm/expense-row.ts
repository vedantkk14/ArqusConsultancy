import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { EXPENSE_CATEGORIES } from '../../projects/data/project.models';
import { formatDay } from '../../projects/ui/business-time';
import { PmExpense } from './pm-dashboard.models';

/** A recent expense. The receipt icon is a nudge (filled = attached), not a warning. Opens the project's expenses. */
@Component({
  selector: 'app-pm-expense-row',
  imports: [InrPipe, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = expense();
    <a
      class="row"
      [routerLink]="['/projects', e.project_id]"
      fragment="exp-title"
      [class.void]="e.is_void"
    >
      <span class="l">
        <span class="pn">{{ e.project_name }}</span>
        <span class="meta">
          {{ day(e.spent_on) }} · {{ category() }}
          @if (e.is_void) {
            <span class="void-tag">Void</span>
          }
        </span>
      </span>
      <span class="amt num">{{ e.amount | inr }}</span>
      <mat-icon
        class="rc"
        [class.on]="e.has_receipt"
        aria-hidden="true"
        [attr.title]="e.has_receipt ? 'Receipt attached' : 'No receipt'"
        >receipt_long</mat-icon
      >
      <span class="sr-only">{{ e.has_receipt ? 'Receipt attached' : 'No receipt' }}</span>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }
    .row {
      position: relative;
      display: grid;
      grid-template-columns: 1fr auto 24px;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 8px var(--space-3);
      border-radius: var(--radius-control);
      color: inherit;
      text-decoration: none;
      transition: background-color var(--dur-fast);
    }
    .row:hover {
      background: var(--surface-2);
    }
    .row:focus-visible {
      outline: 2px solid var(--brand-deep);
      outline-offset: -2px;
      box-shadow: var(--ring);
    }
    .l {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
    }
    .pn {
      overflow: hidden;
      color: var(--ink);
      font-size: var(--text-sm);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .amt {
      color: var(--ink);
      font-size: var(--text-sm);
      font-weight: 600;
    }
    .void .amt,
    .void .pn {
      color: var(--ink-3);
      text-decoration: line-through;
    }
    .void-tag {
      margin-left: 6px;
      padding: 1px 8px;
      border-radius: var(--radius-pill);
      background: var(--tint-slate);
      color: var(--tint-slate-ink);
      font-weight: 600;
    }
    .rc {
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--ink-3);
      font-variation-settings: 'FILL' 0;
    }
    .rc.on {
      color: var(--brand-deep);
      font-variation-settings: 'FILL' 1;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class PmExpenseRow {
  readonly expense = input.required<PmExpense>();
  protected readonly day = formatDay;
  protected readonly category = computed(
    () =>
      EXPENSE_CATEGORIES.find(([key]) => key === this.expense().category)?.[1] ??
      this.expense().category,
  );
}
