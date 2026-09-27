import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
import { QueryParams } from '../../../core/api/api.service';
import { ApiError } from '../../../core/models';
import { AccountsApi } from './accounts-api.service';
import { EMPTY_FILTERS, LedgerFilters, LedgerMode, LedgerRow, LedgerSummary } from './account.models';

export const PAGE_SIZE = 20;

/** Fixed query parts per page mode (the user's filters come on top). */
export const MODE_PRESETS: Record<LedgerMode, { params: QueryParams; ordering: string }> = {
  all: { params: {}, ordering: '-created_at' },
  pending: { params: { has_balance: 'true' }, ordering: '-days_since' },
};

export function toQuery(mode: LedgerMode, filters: LedgerFilters): QueryParams {
  const preset = MODE_PRESETS[mode];
  return {
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
    ...preset.params,
    ordering: filters.ordering || preset.ordering,
  };
}

/** Read the filters from a URL query map (unknown keys ignored). */
export function filtersFromQuery(get: (key: string) => string | null): LedgerFilters {
  const out = { ...EMPTY_FILTERS };
  for (const key of Object.keys(out) as (keyof LedgerFilters)[]) {
    (out as Record<string, string>)[key] = (get(key) ?? '').replace(/ $/, '+'); // a hand-typed "90+" arrives as "90 "
  }
  return out;
}

/** Number of dropdown filters in use (the mobile "Filters (n)" button). */
export function activeFilterCount(f: LedgerFilters): number {
  return [f.aging, f.created_from || f.created_to].filter(Boolean).length;
}

/** Compose the header insight from summary counts, skipping zero parts. */
export function listInsight(s: LedgerSummary | null): string {
  if (!s) {
    return '';
  }
  const parts: string[] = [];
  if (s.overdue_clients) {
    parts.push(`${s.overdue_clients} ${s.overdue_clients === 1 ? 'client' : 'clients'} overdue`);
  }
  if (s.clients_with_balance) {
    parts.push(`${s.clients_with_balance} with a balance`);
  }
  if (s.awaiting_finalization) {
    parts.push(`${s.awaiting_finalization} awaiting finalization`);
  }
  return parts.length ? parts.join(' · ') : 'Every client is fully paid.';
}

interface Request {
  query: QueryParams;
  page: number;
}

/** List state for one page instance: filter changes cancel the request in flight and keep old rows dimmed. */
@Injectable()
export class LedgersListStore {
  private readonly api = inject(AccountsApi);

  readonly rows = signal<LedgerRow[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly summary = signal<LedgerSummary | null>(null);
  readonly hasMore = computed(() => this.rows().length < this.count());

  private query: QueryParams = {};
  private page = 1;
  private readonly requests = new Subject<Request>();

  constructor() {
    this.requests
      .pipe(
        switchMap((req) =>
          this.api.ledgers({ ...req.query, page: req.page, page_size: PAGE_SIZE }).pipe(
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
    const { q, created_from, created_to } = this.query;
    this.api
      .summary({ q, created_from, created_to })
      .pipe(catchError(() => of(null)))
      .subscribe((s) => this.summary.set(s));
  }

  private fetch(page: number): void {
    this.loading.set(true);
    this.requests.next({ query: this.query, page });
  }
}
