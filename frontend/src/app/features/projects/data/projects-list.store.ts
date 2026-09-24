import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { QueryParams } from '../../../core/api/api.service';
import { ApiError } from '../../../core/models';
import { EMPTY_FILTERS, ProjectFilters, ProjectListItem, ProjectMode, ProjectSummary } from './project.models';
import { ProjectsApi } from './projects-api.service';

export const PAGE_SIZE = 20;

/** Fixed query parts per page mode (the user's filters come on top). */
export const MODE_PRESETS: Record<ProjectMode, { params: QueryParams; ordering: string }> = {
  running: { params: { status: 'RUNNING' }, ordering: '-usage_pct' },
  completed: { params: { status: 'COMPLETED' }, ordering: '-created_at' },
};

export function toQuery(mode: ProjectMode, filters: ProjectFilters): QueryParams {
  const preset = MODE_PRESETS[mode];
  return {
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
    ...preset.params,
    ordering: filters.ordering || preset.ordering,
  };
}

/** Read the filters from a URL query map (unknown keys ignored). */
export function filtersFromQuery(get: (key: string) => string | null): ProjectFilters {
  const out = { ...EMPTY_FILTERS };
  for (const key of Object.keys(out) as (keyof ProjectFilters)[]) {
    (out as Record<string, string>)[key] = get(key) ?? '';
  }
  return out;
}

/** Number of dropdown filters in use (the mobile "Filters (n)" button). */
export function activeFilterCount(f: ProjectFilters): number {
  return [f.pm, f.created_from || f.created_to].filter(Boolean).length;
}

/** The chip that matches the state-ish filters ('' = All). Dashboard links map onto chips too. */
export function activeChip(f: ProjectFilters): '' | 'ok' | 'warn' | 'over' | 'no_pm' | 'at_risk' {
  if (f.no_pm === 'true') {
    return 'no_pm';
  }
  if (f.over_budget === 'true') {
    return 'at_risk';
  }
  if (f.near_limit === 'true') {
    return 'warn';
  }
  return (f.state as '' | 'ok' | 'warn' | 'over') || '';
}

/** Compose the header insight from summary counts, skipping zero parts. */
export function listInsight(s: { over: number; warn: number; no_pm?: number } | null): string {
  if (!s) {
    return '';
  }
  const parts: string[] = [];
  if (s.over) {
    parts.push(`${s.over} over budget`);
  }
  if (s.warn) {
    parts.push(`${s.warn} near limit`);
  }
  if (s.no_pm) {
    parts.push(`${s.no_pm} without a project manager`);
  }
  return parts.length ? parts.join(' · ') : 'Every project is within budget.';
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
export class ProjectsListStore {
  private readonly api = inject(ProjectsApi);

  readonly rows = signal<ProjectListItem[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly summary = signal<ProjectSummary | null>(null);
  readonly hasMore = computed(() => this.rows().length < this.count());

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
    const { q, pm, created_from, created_to, status } = this.query;
    this.api
      .summary({ q, pm, created_from, created_to, status })
      .pipe(catchError(() => of(null)))
      .subscribe((s) => this.summary.set(s));
  }

  /** Optimistic row update; returns an undo. */
  patchRow(id: number, patch: Partial<ProjectListItem>): () => void {
    const before = this.rows();
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    return () => this.rows.set(before);
  }

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
