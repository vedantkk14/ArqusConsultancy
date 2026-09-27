import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { EXPENSE_CATEGORIES, ExpenseFilters, Manager } from '../../projects/data/project.models';
import { activeFilterCount } from '../expenses-list.store';

export const SEARCH_DEBOUNCE_MS = 300;

export interface ProjectOption {
  id: number;
  name: string;
}

const ORDERINGS = [
  { value: '-spent_on', label: 'Newest first' },
  { value: 'spent_on', label: 'Oldest first' },
  { value: '-amount', label: 'Highest amount' },
  { value: 'amount', label: 'Lowest amount' },
] as const;

const STATES = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'void', label: 'Void' },
  { value: 'override', label: 'Over-budget overrides' },
] as const;

/** Search, state chips, dropdown filters and sort. Everything is mirrored in the URL. */
@Component({
  selector: 'app-expense-filters',
  imports: [MatBottomSheetModule, MatButtonModule, MatIconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './expense-filters.html',
  styleUrl: '../../projects/components/project-filters.scss',
})
export class ExpenseFiltersBar {
  readonly filters = input.required<ExpenseFilters>();
  readonly projects = input<ProjectOption[]>([]);
  readonly managers = input<Manager[]>([]);
  /** Admin: filter by who logged the expense. */
  readonly showLogger = input(false);
  readonly compact = input(false);
  readonly changed = output<Partial<ExpenseFilters>>();
  readonly cleared = output<void>();

  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly orderings = ORDERINGS;
  protected readonly states = STATES;
  protected readonly search = signal('');
  protected readonly dropdownCount = computed(() => activeFilterCount(this.filters()));
  protected readonly anyActive = computed(() =>
    Object.entries(this.filters()).some(([key, value]) => key !== 'ordering' && value !== ''),
  );

  private readonly sheet = inject(MatBottomSheet);
  private readonly sheetTpl = viewChild.required<TemplateRef<unknown>>('sheet');
  private readonly typed = new Subject<string>();

  constructor() {
    // Keep the box in step with the URL (back button, "Clear filters").
    effect(() => {
      const q = this.filters().q;
      untracked(() => {
        if (q !== this.search()) {
          this.search.set(q);
        }
      });
    });
    this.typed
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((q) => this.changed.emit({ q: q.trim() }));
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.typed.next(value);
  }

  protected set(key: keyof ExpenseFilters, value: string): void {
    this.changed.emit({ [key]: value } as Partial<ExpenseFilters>);
  }

  protected openSheet(): void {
    this.sheet.open(this.sheetTpl(), { ariaLabel: 'Filters' });
  }

  protected closeSheet(): void {
    this.sheet.dismiss();
  }
}
