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
import { activeFilterCount } from '../data/ledgers-list.store';
import { AGING_BUCKETS, LEDGER_ORDERINGS, LedgerFilters, LedgerMode, LedgerState, LedgerSummary, STATE_LABELS } from '../data/account.models';

export const SEARCH_DEBOUNCE_MS = 300;

const STATES: LedgerState[] = ['AWAITING_FINALIZATION', 'UNPAID', 'PARTIAL', 'PAID'];

/** Search, state chips with counts, overdue toggle, aging select, dates and sort. Everything is mirrored in the URL. */
@Component({
  selector: 'app-ledger-filters',
  imports: [MatBottomSheetModule, MatButtonModule, MatIconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ledger-filters.html',
  styleUrl: './ledger-filters.scss',
})
export class LedgerFiltersBar {
  readonly filters = input.required<LedgerFilters>();
  readonly summary = input<LedgerSummary | null>(null);
  readonly mode = input<LedgerMode>('all');
  readonly compact = input(false);
  readonly changed = output<Partial<LedgerFilters>>();
  readonly cleared = output<void>();

  protected readonly states = STATES;
  protected readonly labels = STATE_LABELS;
  protected readonly buckets = AGING_BUCKETS;
  protected readonly orderings = LEDGER_ORDERINGS;
  protected readonly search = signal('');
  protected readonly dropdownCount = computed(() => activeFilterCount(this.filters()));
  protected readonly anyActive = computed(() =>
    Object.entries(this.filters()).some(([key, value]) => key !== 'ordering' && value !== ''),
  );
  protected readonly total = computed(() => {
    const c = this.summary()?.counts;
    return c ? c.AWAITING_FINALIZATION + c.UNPAID + c.PARTIAL + c.PAID : null;
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
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((q) => this.changed.emit({ q: q.trim() }));
  }

  protected countFor(state: LedgerState | ''): number | null {
    const c = this.summary()?.counts;
    return c ? (state ? c[state] : this.total()) : null;
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.typed.next(value);
  }

  protected set(key: keyof LedgerFilters, value: string): void {
    this.changed.emit({ [key]: value } as Partial<LedgerFilters>);
  }

  protected toggleOverdue(on: boolean): void {
    this.changed.emit({ overdue: on ? 'true' : '' });
  }

  protected openSheet(): void {
    this.sheet.open(this.sheetTpl(), { ariaLabel: 'Filters' });
  }

  protected closeSheet(): void {
    this.sheet.dismiss();
  }
}
