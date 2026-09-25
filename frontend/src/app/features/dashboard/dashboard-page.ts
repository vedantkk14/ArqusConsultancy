import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, combineLatest, interval, map, of, startWith, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/models';
import { firstName } from '../../core/models/user-display';
import { LayoutService } from '../../layout/layout.service';
import { DataColumn, DataList, DataRow } from '../../shared/data-list/data-list';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { ErrorState } from '../../shared/error-state/error-state';
import { InrCompactPipe } from '../../shared/money/inr.pipe';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ActivityCard } from './components/activity-card';
import { AgingCard } from './components/aging-card';
import { AttentionPanel } from './components/attention-panel';
import { CashHero } from './components/cash-hero';
import { CreateAccountDialog, CreatedAccount } from './components/create-account-dialog';
import { CountUp } from './components/count-up';
import { FunnelCard } from './components/funnel-card';
import { LeaderboardCard } from './components/leaderboard-card';
import { monthLabel } from './components/month-label';
import { NewMenu } from './components/new-menu';
import { PeriodSwitcher } from './components/period-switcher';
import { ProjectsCard } from './components/projects-card';
import { RadialGauge } from './components/radial-gauge';
import { SourcesCard } from './components/sources-card';
import { Sparkline } from './components/sparkline';
import { BarSegment, StackedBar } from './components/stacked-bar';
import { PmDashboardPage } from './pm/pm-dashboard';
import { NAV_BADGE_SOURCES } from './dashboard-utils';
import { AdminDashboard, PERIOD_NOUN, Period, toPeriod } from './dashboard.models';
import { DashboardService } from './dashboard.service';

type LoadState =
  | { status: 'loading'; data: AdminDashboard | null }
  | { status: 'ready'; data: AdminDashboard }
  | { status: 'error'; data: AdminDashboard | null };

const PAYMENT_COLUMNS: DataColumn[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'client', label: 'Client' },
  { key: 'reference', label: 'Reference', hideOnMobile: true },
  { key: 'amount', label: 'Amount', type: 'money' },
];
const EXPENSE_COLUMNS: DataColumn[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'project', label: 'Project' },
  { key: 'category', label: 'Category', hideOnMobile: true },
  { key: 'amount', label: 'Amount', type: 'money' },
];
const STAGE_COLORS = ['data-slate', 'data-cyan', 'data-teal', 'data-ink'];

@Component({
  selector: 'app-dashboard-page',
  imports: [
    ActivityCard,
    AgingCard,
    AttentionPanel,
    CashHero,
    CountUp,
    DataList,
    EmptyState,
    ErrorState,
    FunnelCard,
    InrCompactPipe,
    LeaderboardCard,
    MatIconModule,
    MatTabsModule,
    MatTooltipModule,
    NewMenu,
    PeriodSwitcher,
    PmDashboardPage,
    ProjectsCard,
    RadialGauge,
    RouterLink,
    Skeleton,
    SourcesCard,
    Sparkline,
    StackedBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrls: ['./dashboard-page.scss', './kpi-cards.scss'],
})
export class DashboardPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly layout = inject(LayoutService);

  protected readonly paymentColumns = PAYMENT_COLUMNS;
  protected readonly expenseColumns = EXPENSE_COLUMNS;

  /** The admin endpoint is admin-only; other roles get their own dashboards later. */
  protected readonly isAdmin = computed(() => this.auth.role() === Role.Admin);
  protected readonly isPm = computed(() => this.auth.role() === Role.ProjectManager);
  protected readonly firstName = computed(() => firstName(this.auth.user()?.name));

  /** The period lives in the URL (?period=quarter) so it survives reloads and can be shared. */
  protected readonly period = toSignal(this.route.queryParamMap.pipe(map((p) => toPeriod(p.get('period')))), {
    initialValue: toPeriod(this.route.snapshot.queryParamMap.get('period')),
  });

  private readonly reload$ = new Subject<void>();
  protected readonly state = signal<LoadState>({ status: 'loading', data: null });
  protected readonly data = computed(() => this.state().data);
  protected readonly refreshing = computed(() => this.state().status === 'loading' && !!this.state().data);

  /** "Updated N min ago": loaded-at time plus a clock that ticks every 30s. */
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

  // ---- Derived display values --------------------------------------------------------------------
  protected readonly periodNoun = computed(() => PERIOD_NOUN[this.period()]);

  protected readonly leadsDelta = computed(() => {
    const k = this.data()?.kpis;
    if (!k || this.period() === 'all') {
      return null;
    }
    const diff = k.leads_new - k.leads_new_prev;
    return { text: `${diff >= 0 ? '+' : ''}${diff} vs previous`, negative: diff < 0 };
  });

  protected readonly leadsSparkLabel = computed(() => {
    const d = this.data();
    const parts = (d?.trends.leads_new ?? []).map((v, i) => `${monthLabel(d?.trends.months[i] ?? '')} ${v}`);
    return `New leads per month: ${parts.join(', ')}`;
  });

  /** Open stages only (Won / Lost are closed), largest first, for the opportunities mini-bar. */
  protected readonly openStages = computed(() =>
    (this.data()?.funnel ?? [])
      .filter((s) => s.status !== 'WON' && s.status !== 'LOST')
      .map((s, i) => ({ ...s, color: STAGE_COLORS[i % STAGE_COLORS.length] })),
  );
  protected readonly openSegments = computed<BarSegment[]>(() =>
    this.openStages().map((s) => ({ label: s.label, value: s.count, color: s.color })),
  );
  protected readonly topStages = computed(() => [...this.openStages()].sort((a, b) => b.count - a.count).slice(0, 3));

  protected readonly recentPayments = computed(() => (this.data()?.recent.payments ?? []).slice(0, 5) as unknown as DataRow[]);
  protected readonly recentExpenses = computed(() => (this.data()?.recent.expenses ?? []).slice(0, 5) as unknown as DataRow[]);

  constructor() {
    const today = new Date();
    this.layout.subtitle.set(
      today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    );
    inject(DestroyRef).onDestroy(() => {
      this.layout.subtitle.set('');
      this.layout.navBadges.set({});
    });

    // Sidebar count badges come from the same attention data.
    effect(() => {
      const attention = this.data()?.attention;
      if (!attention) {
        return;
      }
      const badges: Record<string, { count: number; tone: 'rose' | 'amber' }> = {};
      for (const src of NAV_BADGE_SOURCES) {
        const count = attention.find((a) => a.key === src.key)?.count ?? 0;
        if (count > 0) {
          badges[src.route] = { count, tone: src.tone };
        }
      }
      this.layout.navBadges.set(badges);
    });

    combineLatest([toObservable(this.period), this.reload$.pipe(startWith(undefined))])
      .pipe(
        switchMap(([period]) => {
          if (!this.isAdmin()) {
            return of<LoadState>({ status: 'loading', data: null });
          }
          return this.service.loadAdmin(period).pipe(
            map((data): LoadState => ({ status: 'ready', data })),
            tap(() => this.loadedAt.set(new Date())),
            catchError(() => of<LoadState>({ status: 'error', data: null })),
            startWith<LoadState>({ status: 'loading', data: this.state().data }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((s) => this.state.set(s));
  }

  /** Admin creates a login for any role; the new user signs in and lands on their own dashboard. */
  protected createAccount(): void {
    this.dialog
      .open<CreateAccountDialog, void, CreatedAccount>(CreateAccountDialog, {
        width: '640px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((user) => user && this.snack.open(`Account created for ${user.name}.`, undefined, { duration: 4000 }));
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
