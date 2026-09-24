import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
import { QueryParams } from '../../../core/api/api.service';
import { ApiError } from '../../../core/models';
import { AccountsApi } from './accounts-api.service';
import { EMPTY_PAYMENT_FILTERS, Payment, PaymentFilters, PaymentSummary } from './account.models';

export const PAGE_SIZE = 20;
export const DEFAULT_ORDERING = '-received_on';

export function toQuery(filters: PaymentFilters): QueryParams {
  return {
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
    ordering: filters.ordering || DEFAULT_ORDERING,
  };
}

/** Read the filters from a URL query map (unknown keys ignored). */
export function filtersFromQuery(get: (key: string) => string | null): PaymentFilters {
  const out = { ...EMPTY_PAYMENT_FILTERS };
  for (const key of Object.keys(out) as (keyof PaymentFilters)[]) {
    (out as Record<string, string>)[key] = get(key) ?? '';
  }
  return out;
}

/** Number of dropdown filters in use (the mobile "Filters (n)" button). */
export function activeFilterCount(f: PaymentFilters): number {
  return [f.mode, f.has_proof, f.date_from || f.date_to].filter(Boolean).length;
}

interface Request {
  query: QueryParams;
  page: number;
}

/**
 * List state for the payment entries page. Filter changes cancel the request in flight (switchMap) and keep
 * the previous rows on screen (dimmed) until the new ones arrive. Totals come from the server.
 */
@Injectable()
export class PaymentsListStore {
  private readonly api = inject(AccountsApi);

  readonly rows = signal<Payment[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly summary = signal<PaymentSummary | null>(null);
  readonly hasMore = computed(() => this.rows().length < this.count());

  private query: QueryParams = {};
  private page = 1;
  private readonly requests = new Subject<Request>();

  constructor() {
    this.requests
      .pipe(
        switchMap((req) =>
          this.api.payments({ ...req.query, page: req.page, page_size: PAGE_SIZE }).pipe(
            map((res) => ({ req, res, error: null as ApiError | null })),
            catchError((error: ApiError) => of({ req, res: null, error })),
          ),
        ),
      )
      .subscribe(({ req, res, error }) => {
        this.loading.set(false);
        if (!res) {
          this.error.set(error);
          return;
        }
        this.error.set(null);
        this.loaded.set(true);
        this.page = req.page;
        this.count.set(res.count);
        this.rows.update((rows) => (req.page === 1 ? res.results : [...rows, ...res.results]));
      });
  }

  load(query: QueryParams): void {
    this.query = query;
    this.fetch(1);
    this.refreshSummary();
  }

  reload(): void {
    this.fetch(1);
    this.refreshSummary();
  }

  loadMore(): void {
    if (!this.loading() && this.hasMore()) {
      this.fetch(this.page + 1);
    }
  }

  refreshSummary(): void {
    const filters = Object.fromEntries(Object.entries(this.query).filter(([key]) => key !== 'ordering'));
    this.api
      .paymentSummary(filters)
      .pipe(catchError(() => of(null)))
      .subscribe((s) => this.summary.set(s));
  }

  private fetch(page: number): void {
    this.loading.set(true);
    this.requests.next({ query: this.query, page });
  }
}
