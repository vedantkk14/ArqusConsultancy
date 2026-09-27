import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, combineLatest, interval, map, merge, of, startWith, switchMap, tap } from 'rxjs';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ActivityCard } from '../components/activity-card';
import { RecentActivity } from '../dashboard.models';
import { LayoutService } from '../../../layout/layout.service';
import { ExecQueueSection } from './components/exec-queue-section';
import { FollowUpNowCard } from './components/follow-up-now-card';
import { MyPipelineCard } from './components/my-pipeline-card';
import { MyResultsStrip } from './components/my-results-strip';
import { UpcomingCard } from './components/upcoming-card';
import { Period, SalesExecDashboard, toPeriod } from './sales-exec-dashboard.models';
import { SalesExecDashboardService } from './sales-exec-dashboard.service';

type LoadState =
  | { status: 'loading'; data: SalesExecDashboard | null }
  | { status: 'ready'; data: SalesExecDashboard }
  | { status: 'error'; data: null };

/** Auto-refresh cadence while an exec is sitting on this page. */
const POLL_MS = 45_000;

const ACTION_VERB: Record<string, string> = {
  CALL: 'called about',
  WHATSAPP: 'messaged about',
  EMAIL: 'emailed about',
  MEETING: 'met about',
  NOTE: 'noted on',
  STATUS_CHANGE: 'updated the status of',
  ASSIGNMENT: 'reassigned',
  AMOUNT_CHANGE: 'updated the value on',
};

@Component({
  selector: 'app-sales-exec-dashboard-page',
  imports: [
    ActivityCard,
    EmptyState,
    ErrorState,
    ExecQueueSection,
    FollowUpNowCard,
    MatIconModule,
    MatTooltipModule,
    MyPipelineCard,
    MyResultsStrip,
    Skeleton,
    UpcomingCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-exec-dashboard.page.html',
  styleUrl: './sales-exec-dashboard.page.scss',
})
export class SalesExecDashboardPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(SalesExecDashboardService);
  protected readonly layout = inject(LayoutService);

  /** The period lives in the URL (?period=quarter) so it survives reloads and can be shared. */
  protected readonly period = toSignal(
    this.route.queryParamMap.pipe(map((p) => toPeriod(p.get('period')))),
    { initialValue: toPeriod(this.route.snapshot.queryParamMap.get('period')) },
  );

  private readonly reload$ = new Subject<void>();
  protected readonly state = signal<LoadState>({ status: 'loading', data: null });
  protected readonly data = computed(() => this.state().data);
  protected readonly refreshing = computed(() => this.state().status === 'loading' && !!this.data());

  private readonly loadedAt = signal<Date | null>(null);
  protected readonly now = toSignal(interval(30_000).pipe(map(() => new Date())), { initialValue: new Date() });
  protected readonly updatedText = computed(() => {
    const at = this.loadedAt();
    if (!at) {
      return 'Loading';
    }
    const minutes = Math.floor((this.now().getTime() - at.getTime()) / 60_000);
    return minutes < 1 ? 'Updated just now' : `Updated ${minutes} min ago`;
  });

  protected readonly today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  /** No leads have ever been assigned to this exec - the pipeline totals every status, unfiltered by period. */
  protected readonly hasNoLeads = computed(() => {
    const d = this.data();
    return !!d && d.pipeline.every((stage) => stage.count === 0);
  });

  protected readonly activityRows = computed<RecentActivity[]>(() =>
    (this.data()?.recent_activity ?? []).map((a) => ({
      when: a.at,
      actor: 'You',
      action: `${ACTION_VERB[a.type] ?? 'logged an activity on'} ${a.lead_name}${a.text ? ': ' + a.text : ''}`,
      type: 'lead',
    })),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.layout.subtitle.set(''));
    this.layout.subtitle.set(this.today);

    const trigger$ = merge(this.reload$, interval(POLL_MS)).pipe(startWith(undefined));
    combineLatest([toObservable(this.period), trigger$])
      .pipe(
        switchMap(([period]) =>
          this.service.load(period).pipe(
            map((data): LoadState => ({ status: 'ready', data })),
            tap(() => this.loadedAt.set(new Date())),
            catchError(() => of<LoadState>({ status: 'error', data: null })),
            startWith<LoadState>({ status: 'loading', data: this.state().data }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((s) => this.state.set(s));
  }

  protected setPeriod(period: Period): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { period: period === 'month' ? null : period },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected reload(): void {
    this.reload$.next();
  }
}
