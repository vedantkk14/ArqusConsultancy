import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiError } from '../../core/models';
import { ErrorState } from '../../shared/error-state/error-state';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { PanelHead } from '../dashboard/components/panel-head';
import { REPORT_PERIODS, REPORT_PERIOD_LABELS, ReportPeriod, toReportPeriod } from './reports.models';

/** Query params every report shares. `custom` needs both dates before it can be loaded. */
export function reportParams(qp: { get(k: string): string | null }) {
  const period = toReportPeriod(qp.get('period'));
  const from = qp.get('from') ?? '';
  const to = qp.get('to') ?? '';
  const ready = period !== 'custom' || (!!from && !!to && from <= to);
  return { period, from, to, ready, query: period === 'custom' ? { period, from, to } : { period } };
}

/**
 * The header every report shares: title, period switcher (URL-synced), custom dates, one Export CSV
 * button, and the loading / error states. The report itself is projected in.
 */
@Component({
  selector: 'app-report-frame',
  imports: [ErrorState, MatButtonModule, MatIconModule, PanelHead, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './report-frame.scss',
  template: `
    <section class="card frame" [attr.aria-label]="title()">
      <app-panel-head [title]="title()" [subtitle]="subtitle()">
        <button matButton="outlined" type="button" [disabled]="exporting() || !ready() || !hasData()" (click)="exported.emit()">
          <mat-icon aria-hidden="true">download</mat-icon>{{ exporting() ? 'Exporting…' : 'Export CSV' }}
        </button>
      </app-panel-head>
      <div class="bar">
        <div class="seg" role="group" aria-label="Period">
          @for (p of periods; track p) {
            <button type="button" [class.on]="period() === p" [attr.aria-pressed]="period() === p" (click)="setPeriod(p)">{{ labels[p] }}</button>
          }
        </div>
        @if (period() === 'custom') {
          <label class="d"><span class="sr-only">From</span><input type="date" [value]="params().from" (change)="set('from', $any($event.target).value)" /></label>
          <span class="to">to</span>
          <label class="d"><span class="sr-only">To</span><input type="date" [value]="params().to" (change)="set('to', $any($event.target).value)" /></label>
        }
      </div>
    </section>

    @if (!ready()) {
      <p class="hint">Choose a start and end date (start on or before end) to see this report.</p>
    } @else if (error() && !hasData()) {
      <app-error-state [title]="errorTitle()" (retry)="retry.emit()" />
    } @else if (!hasData()) {
      <div class="card sk" aria-hidden="true"><app-skeleton width="40%" height="20px" /><app-skeleton height="180px" /></div>
    } @else {
      @if (note()) {
        <p class="banner"><mat-icon aria-hidden="true">info</mat-icon>{{ note() }}</p>
      }
      <div class="body" [class.busy]="loading()" [attr.aria-busy]="loading()"><ng-content /></div>
    }
  `,
})
export class ReportFrame {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly hasData = input(false);
  readonly loading = input(false);
  readonly error = input<ApiError | null>(null);
  readonly exporting = input(false);
  readonly note = input<string | null>(null);
  readonly retry = output<void>();
  readonly exported = output<void>();

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly params = computed(() => reportParams(this.qp()));
  protected readonly period = computed(() => this.params().period);
  protected readonly ready = computed(() => this.params().ready);
  protected readonly errorTitle = computed(() => `Couldn't load ${this.title().toLowerCase()}`);
  protected readonly periods = REPORT_PERIODS;
  protected readonly labels = REPORT_PERIOD_LABELS;

  protected setPeriod(p: ReportPeriod): void {
    this.nav({ period: p === 'month' ? null : p, ...(p === 'custom' ? {} : { from: null, to: null }) });
  }

  protected set(key: 'from' | 'to', value: string): void {
    this.nav({ [key]: value || null });
  }

  private nav(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }
}
