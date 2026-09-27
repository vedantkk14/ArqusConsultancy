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
import { PAYMENT_MODES, PaymentFilters } from '../data/account.models';
import { activeFilterCount } from '../data/payments-list.store';

export const SEARCH_DEBOUNCE_MS = 300;

const ORDERINGS = [
  { value: '-received_on', label: 'Newest first' },
  { value: 'received_on', label: 'Oldest first' },
  { value: '-amount', label: 'Highest amount' },
  { value: 'amount', label: 'Lowest amount' },
] as const;

const STATES = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'void', label: 'Void' },
] as const;

/** Search, state chips, dropdown filters and sort. Everything is mirrored in the URL. */
@Component({
  selector: 'app-payment-filters',
  imports: [MatBottomSheetModule, MatButtonModule, MatIconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payment-filters.html',
  styleUrl: './ledger-filters.scss',
})
export class PaymentFiltersBar {
  readonly filters = input.required<PaymentFilters>();
  readonly compact = input(false);
  readonly changed = output<Partial<PaymentFilters>>();
  readonly cleared = output<void>();

  protected readonly modes = PAYMENT_MODES;
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

  protected set(key: keyof PaymentFilters, value: string): void {
    this.changed.emit({ [key]: value } as Partial<PaymentFilters>);
  }

  protected openSheet(): void {
    this.sheet.open(this.sheetTpl(), { ariaLabel: 'Filters' });
  }

  protected closeSheet(): void {
    this.sheet.dismiss();
  }
}
