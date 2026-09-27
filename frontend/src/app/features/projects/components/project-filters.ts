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
import { activeChip, activeFilterCount } from '../data/projects-list.store';
import {
  ADMIN_ORDERINGS,
  Manager,
  ORDERINGS,
  ProjectFilters,
  ProjectSummary,
} from '../data/project.models';

export const SEARCH_DEBOUNCE_MS = 300;

type Chip = '' | 'ok' | 'warn' | 'over' | 'no_pm' | 'at_risk';

/** Search, state chips with counts, dropdown filters and sort. Everything is mirrored in the URL. */
@Component({
  selector: 'app-project-filters',
  imports: [MatBottomSheetModule, MatButtonModule, MatIconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-filters.html',
  styleUrl: './project-filters.scss',
})
export class ProjectFiltersBar {
  readonly filters = input.required<ProjectFilters>();
  readonly summary = input<ProjectSummary | null>(null);
  readonly showPm = input(false);
  /** Admin: budget-state chips and the budget ordering. A PM never sees any budget. */
  readonly showBudget = input(false);
  readonly managers = input<Manager[]>([]);
  readonly compact = input(false);
  readonly changed = output<Partial<ProjectFilters>>();
  readonly cleared = output<void>();

  /** False for the Sales Manager: no "Highest spend" ordering. */
  readonly showSpend = input(true);
  protected readonly orderings = computed(() =>
    this.showBudget() ? ADMIN_ORDERINGS : ORDERINGS.filter((o) => this.showSpend() || o.value !== '-spent'),
  );
  protected readonly search = signal('');
  protected readonly chip = computed(() => activeChip(this.filters()));
  protected readonly dropdownCount = computed(() => activeFilterCount(this.filters()));
  protected readonly anyActive = computed(() =>
    Object.entries(this.filters()).some(([key, value]) => key !== 'ordering' && value !== ''),
  );
  protected readonly total = computed(() => {
    const s = this.summary();
    return s ? (s.ok ?? 0) + (s.warn ?? 0) + (s.over ?? 0) : null;
  });

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
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((q) => this.changed.emit({ q: q.trim() }));
  }

  protected countFor(chip: Chip): number | null {
    const s = this.summary();
    if (!s) {
      return null;
    }
    switch (chip) {
      case 'ok':
        return s.ok ?? 0;
      case 'warn':
        return s.warn ?? 0;
      case 'over':
        return s.over ?? 0;
      case 'no_pm':
        return s.no_pm ?? 0;
      case 'at_risk':
        return (s.warn ?? 0) + (s.over ?? 0);
      default:
        return this.total();
    }
  }

  protected pick(chip: Chip): void {
    const none = { state: '', over_budget: '', near_limit: '', no_pm: '' };
    if (chip === 'no_pm') {
      this.changed.emit({ ...none, no_pm: 'true' });
    } else if (chip === 'at_risk') {
      this.changed.emit({ ...none, over_budget: 'true' });
    } else {
      this.changed.emit({ ...none, state: chip });
    }
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.typed.next(value);
  }

  protected set(key: keyof ProjectFilters, value: string): void {
    this.changed.emit({ [key]: value } as Partial<ProjectFilters>);
  }

  protected openSheet(): void {
    this.sheet.open(this.sheetTpl(), { ariaLabel: 'Filters' });
  }

  protected closeSheet(): void {
    this.sheet.dismiss();
  }
}
