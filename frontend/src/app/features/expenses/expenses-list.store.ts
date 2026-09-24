import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
import { QueryParams } from '../../core/api/api.service';
import { ApiError } from '../../core/models';
import { EMPTY_EXPENSE_FILTERS, Expense, ExpenseFilters, ExpenseSummary } from '../projects/data/project.models';
import { ProjectsApi } from '../projects/data/projects-api.service';

export const PAGE_SIZE = 20;
export const DEFAULT_ORDERING = '-spent_on';

export function toQuery(filters: ExpenseFilters): QueryParams {
  return {
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
    ordering: filters.ordering || DEFAULT_ORDERING,
  };
}

/** Read the filters from a URL query map (unknown keys ignored). */
export function filtersFromQuery(get: (key: string) => string | null): ExpenseFilters {
  const out = { ...EMPTY_EXPENSE_FILTERS };
  for (const key of Object.keys(out) as (keyof ExpenseFilters)[]) {
    (out as Record<string, string>)[key] = get(key) ?? '';
  }
  return out;
}

/** Number of dropdown filters in use (the mobile "Filters (n)" button). */
export function activeFilterCount(f: ExpenseFilters): number {
  return [f.project, f.category, f.logged_by, f.has_receipt, f.date_from || f.date_to].filter(Boolean).length;
}

interface Request {
  query: QueryParams;
  page: number;
}

/**
 * List state for the all-expenses page. Filter changes cancel the request in flight (switchMap) and keep
 * the previous rows on screen (dimmed) until the new ones arrive. Totals come from the server.
 */
@Injectable()
export class ExpensesListStore {
  private readonly api = inject(ProjectsApi);

  readonly rows = signal<Expense[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly summary = signal<ExpenseSummary | null>(null);
  readonly hasMore = computed(() => this.rows().length < this.count());

  private query: QueryParams = {};
  private page = 1;
  private readonly requests = new Subject<Request>();

  constructor() {
    this.requests
      .pipe(
        switchMap((req) =>
          this.api.expenses({ ...req.query, page: req.page, page_size: PAGE_SIZE }).pipe(
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
      .expenseSummary(filters)
      .pipe(catchError(() => of(null)))
      .subscribe((s) => this.summary.set(s));
  }

  private fetch(page: number): void {
    this.loading.set(true);
    this.requests.next({ query: this.query, page });
  }
}
