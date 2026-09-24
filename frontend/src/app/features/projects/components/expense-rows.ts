import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Expense } from '../data/project.models';
import { PersonAvatar } from '../ui/bits';
import { formatBusinessFull, formatDay } from '../ui/business-time';

/** Category tints: the label is always written, the tint only reinforces it. */
export const CATEGORY_TINT: Record<string, string> = {
  MATERIALS: 'cyan',
  LABOUR: 'teal',
  TRANSPORT: 'slate',
  EQUIPMENT: 'amber',
  FOOD: 'rose',
  PERMITS: 'slate',
  OTHER: 'slate',
};

export interface ExpenseAction {
  kind: 'receipt' | 'edit' | 'void';
  expense: Expense;
}

/** Expenses as a table (>= 768px) or stacked cards (phones). Void rows stay visible with a "Void" tag. */
@Component({
  selector: 'app-expense-rows',
  imports: [InrPipe, MatIconModule, MatMenuModule, NgTemplateOutlet, PersonAvatar, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './expense-rows.html',
  styleUrl: './expense-rows.scss',
})
export class ExpenseRows {
  readonly rows = input.required<Expense[]>();
  readonly layout = input<'table' | 'cards'>('table');
  /** The all-expenses page shows the project (as a link) and who logged it. */
  readonly showProject = input(false);
  readonly skeleton = input(false);
  /** The all-expenses page can void but not edit (edit needs the project's budget context). */
  readonly allowEdit = input(true);
  readonly action = output<ExpenseAction>();

  protected readonly placeholders = Array.from({ length: 5 }, (_, i) => i);
  protected readonly day = formatDay;
  protected readonly full = formatBusinessFull;
  protected readonly tint = (category: string): string => CATEGORY_TINT[category] ?? 'slate';

  protected label(e: Expense): string {
    return `${e.category_label} expense of ${e.amount}${e.vendor ? ' from ' + e.vendor : ''}`;
  }

  protected emit(kind: ExpenseAction['kind'], expense: Expense): void {
    this.action.emit({ kind, expense });
  }
}
