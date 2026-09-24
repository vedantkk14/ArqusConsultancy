import { DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, Subject, catchError, map, of, switchMap } from 'rxjs';
import { ApiError } from '../../core/models';
import { QueryParams } from '../../core/api/api.service';
import { ReportSlug, ReportsApi } from './reports.api';

/** Load state of one report: a new period cancels the request in flight; old data stays (dimmed) meanwhile. */
export class ReportState<T> {
  readonly data = signal<T | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  private params: QueryParams = {};
  private readonly requests = new Subject<QueryParams>();

  constructor(
    private readonly slug: ReportSlug,
    private readonly fetch: (p: QueryParams) => Observable<T>,
    private readonly api: ReportsApi,
    private readonly snack: MatSnackBar,
    destroyRef: DestroyRef,
  ) {
    this.requests
      .pipe(
        switchMap((p) =>
          this.fetch(p).pipe(
            map((data) => ({ data, error: null as ApiError | null })),
            catchError((error: ApiError) => of({ data: null, error })),
          ),
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(({ data, error }) => {
        this.loading.set(false);
        this.error.set(error);
        if (data) {
          this.data.set(data);
        }
      });
  }

  load(params: QueryParams): void {
    this.params = params;
    this.loading.set(true);
    this.requests.next(params);
  }

  reload(): void {
    this.load(this.params);
  }

  exportCsv(): void {
    this.exporting.set(true);
    this.api.csv(this.slug, this.params).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url));
      },
      error: () => {
        this.exporting.set(false);
        this.snack.open("Couldn't export the report. Try again.", 'Dismiss', { duration: 6000 });
      },
    });
  }
}
