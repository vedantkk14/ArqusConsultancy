import { DestroyRef, computed, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { QueryParams } from '../../../core/api/api.service';
import { ApiError, PaginatedResponse } from '../../../core/models';

/**
 * List state for a page: a filter change cancels the request in flight (switchMap) and the previous rows
 * stay on screen, dimmed, until the new ones arrive. "Load more" appends the next page.
 */
export class PagedList<T> {
  readonly rows = signal<T[]>([]);
  readonly count = signal(0);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly hasMore = computed(() => this.rows().length < this.count());

  private query: QueryParams = {};
  private page = 1;
  private readonly requests = new Subject<{ query: QueryParams; page: number }>();

  constructor(
    private readonly fetch: (query: QueryParams, page: number) => Observable<PaginatedResponse<T>>,
    destroyRef: DestroyRef,
  ) {
    this.requests
      .pipe(
        switchMap((req) =>
          this.fetch(req.query, req.page).pipe(
            map((res) => ({ req, res, error: null as ApiError | null })),
            catchError((error: ApiError) => of({ req, res: null, error })),
          ),
        ),
        takeUntilDestroyed(destroyRef),
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
    this.go(1);
  }

  reload(): void {
    this.go(1);
  }

  more(): void {
    if (!this.loading() && this.hasMore()) {
      this.go(this.page + 1);
    }
  }

  /** Replace one row in place (after an edit) without reloading. */
  patch(match: (row: T) => boolean, replace: (row: T) => T): void {
    this.rows.update((rows) => rows.map((r) => (match(r) ? replace(r) : r)));
  }

  private go(page: number): void {
    this.loading.set(true);
    this.requests.next({ query: this.query, page });
  }
}
