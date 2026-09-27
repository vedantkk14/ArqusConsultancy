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
import { NgTemplateOutlet } from '@angular/common';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Assignee,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LeadFilters,
  LeadStatus,
  LeadSummary,
  ListMode,
  ORDERINGS,
  STATUS_LABELS,
} from '../data/lead.models';
import { activeFilterCount } from '../data/leads-list.store';

export const SEARCH_DEBOUNCE_MS = 300;

/** Search, status chips with counts, dropdown filters and sort. Everything is mirrored in the URL. */
@Component({
  selector: 'app-lead-filters',
  imports: [MatBottomSheetModule, MatButtonModule, MatIconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lead-filters.html',
  styleUrl: './lead-filters.scss',
})
export class LeadFiltersBar {
  readonly filters = input.required<LeadFilters>();
  readonly summary = input<LeadSummary | null>(null);
  readonly mode = input<ListMode>('all');
  readonly showAssignee = input(false);
  readonly assignees = input<Assignee[]>([]);
  readonly compact = input(false);
  readonly changed = output<Partial<LeadFilters>>();
  readonly cleared = output<void>();

  /** All leads shows open leads only: Won and Lost have their own pages. */
  protected readonly statuses = LEAD_STATUSES.filter((s) => s !== 'WON' && s !== 'LOST');
  protected readonly labels = STATUS_LABELS;
  protected readonly sources = LEAD_SOURCES;
  protected readonly orderings = ORDERINGS;
  protected readonly search = signal('');
  protected readonly showChips = computed(() => this.mode() === 'all');
  protected readonly dropdownCount = computed(() => activeFilterCount(this.filters()));
  protected readonly anyActive = computed(() =>
    Object.entries(this.filters()).some(([key, value]) => key !== 'ordering' && value !== ''),
  );
  protected readonly total = computed(
    () => this.summary()?.by_status.filter((s) => s.status !== 'WON' && s.status !== 'LOST').reduce((sum, s) => sum + s.count, 0) ?? null,
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

  protected countFor(status: LeadStatus | ''): number | null {
    const s = this.summary();
    if (!s) {
      return null;
    }
    return status ? (s.by_status.find((b) => b.status === status)?.count ?? 0) : this.total();
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.typed.next(value);
  }

  protected set(key: keyof LeadFilters, value: string): void {
    this.changed.emit({ [key]: value } as Partial<LeadFilters>);
  }

  protected openSheet(): void {
    this.sheet.open(this.sheetTpl(), { ariaLabel: 'Filters' });
  }

  protected closeSheet(): void {
    this.sheet.dismiss();
  }
}
