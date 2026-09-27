import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { QueryParams } from '../../../core/api/api.service';
import { ApiError } from '../../../core/models';
import { LeadsApi } from './leads-api.service';
import { EMPTY_FILTERS, LeadFilters, LeadListItem, LeadSummary, ListMode } from './lead.models';

export const PAGE_SIZE = 20;

/** Fixed query parts per page mode (the user's filters come on top). */
export const MODE_PRESETS: Record<ListMode, { params: QueryParams; ordering: string }> = {
  all: { params: { open: 'true' }, ordering: '-created_at' },
  overdue: { params: { followup: 'overdue' }, ordering: '-days_overdue' },
  won: { params: { status: 'WON' }, ordering: '-won_at' },
  lost: { params: { status: 'LOST' }, ordering: '-last_activity_at' },
};

export function toQuery(mode: ListMode, filters: LeadFilters): QueryParams {
  const preset = MODE_PRESETS[mode];
  return {
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
    ...preset.params,
    ordering: filters.ordering || preset.ordering,
  };
}

/** Read the filters from a URL query map (unknown keys ignored). */
export function filtersFromQuery(get: (key: string) => string | null): LeadFilters {
  const out = { ...EMPTY_FILTERS };
  for (const key of Object.keys(out) as (keyof LeadFilters)[]) {
    (out as Record<string, string>)[key] = get(key) ?? '';
  }
  return out;
}

/** Number of dropdown filters in use (the mobile "Filters (n)" button). */
export function activeFilterCount(f: LeadFilters): number {
  return [f.assigned_to, f.source, f.followup, f.created_from || f.created_to].filter(Boolean).length;
}

interface Request {
  query: QueryParams;
  page: number;
}

/**
 * List state for one page instance. Filter changes cancel the request in flight (switchMap) and keep
 * the previous rows on screen (dimmed) until the new ones arrive.
 */
@Injectable()
export class LeadsListStore {
  private readonly api = inject(LeadsApi);

  readonly rows = signal<LeadListItem[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly summary = signal<LeadSummary | null>(null);
  readonly selected = signal<ReadonlySet<number>>(new Set());

  readonly hasMore = computed(() => this.rows().length < this.count());
  readonly selectedIds = computed(() => [...this.selected()]);

  private query: QueryParams = {};
  private page = 1;
  private readonly requests = new Subject<Request>();

  constructor() {
    this.requests
      .pipe(
        switchMap((req) =>
          this.api.list({ ...req.query, page: req.page, page_size: PAGE_SIZE }).pipe(
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

  /** New filters: first page, clear the selection. */
  load(query: QueryParams): void {
    this.query = query;
    this.selected.set(new Set());
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
    const { q, assigned_to, source, created_from, created_to } = this.query;
    this.api
      .summary({ q, assigned_to, source, created_from, created_to })
      .pipe(catchError(() => of(null)))
      .subscribe((s) => this.summary.set(s));
  }

  toggle(id: number): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  toggleAll(on: boolean): void {
    this.selected.set(on ? new Set(this.rows().map((r) => r.id)) : new Set());
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  /** Optimistic row update; returns an undo. */
  patchRow(id: number, patch: Partial<LeadListItem>): () => void {
    const before = this.rows();
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    return () => this.rows.set(before);
  }

  /** Optimistic removal (e.g. snoozed out of Overdue, finalized); returns an undo. */
  removeRow(id: number): () => void {
    const before = this.rows();
    const count = this.count();
    this.rows.update((rows) => rows.filter((r) => r.id !== id));
    this.count.update((c) => Math.max(0, c - 1));
    return () => {
      this.rows.set(before);
      this.count.set(count);
    };
  }

  /** Run a write with an optimistic change; roll back on failure. */
  optimistic<T>(apply: () => () => void, request: Observable<T>): Observable<T | null> {
    const undo = apply();
    return request.pipe(
      catchError(() => {
        undo();
        return of(null);
      }),
    );
  }

  private fetch(page: number): void {
    this.loading.set(true);
    this.requests.next({ query: this.query, page });
  }
}
