import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { findNavItem } from '../../core/config/route-helpers';
import { Role } from '../../core/models';
import { LayoutService } from '../../layout/layout.service';
import { DataColumn, DataList, DataRow } from '../../shared/data-list/data-list';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { ErrorState } from '../../shared/error-state/error-state';
import { InrCompactPipe, InrPipe, formatInrCompact } from '../../shared/money/inr.pipe';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { AttentionPanel } from './components/attention-panel';
import { BarList, BarRow } from './components/bar-list';
import { CashflowChart } from './components/cashflow-chart';
import { CountUp } from './components/count-up';
import { monthLabel } from './components/month-label';
import { PeriodSwitcher } from './components/period-switcher';
import { Sparkline } from './components/sparkline';
import { SplitBar } from './components/split-bar';
import {
  AdminDashboard,
  PERIOD_COMPARISON,
  PERIOD_NOUN,
  Period,
  toPeriod,
} from './dashboard.models';
import { DashboardService } from './dashboard.service';

type LoadState =
  | { status: 'loading'; data: AdminDashboard | null }
  | { status: 'ready'; data: AdminDashboard }
  | { status: 'error'; data: AdminDashboard | null };

const QUICK_ACTIONS = [
  { label: 'Add lead', icon: 'person_add', route: '/leads/new' },
  { label: 'Record payment', icon: 'payments', route: '/accounts/payments' },
  { label: 'Convert won lead', icon: 'transform', route: '/projects/convert' },
  { label: 'Add user', icon: 'group_add', route: '/team/users' },
];

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
const ACTIVITY_COLUMNS: DataColumn[] = [
  { key: 'when', label: 'When', type: 'date' },
  { key: 'actor', label: 'Who' },
  { key: 'action', label: 'What' },
];

@Component({
  selector: 'app-dashboard-page',
  imports: [
    AttentionPanel,
    BarList,
    CashflowChart,
    CountUp,
    DataList,
    EmptyState,
    ErrorState,
    InrCompactPipe,
    InrPipe,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatTooltipModule,
    PeriodSwitcher,
    RouterLink,
    Skeleton,
    Sparkline,
    SplitBar,
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
  private readonly layout = inject(LayoutService);

  protected readonly paymentColumns = PAYMENT_COLUMNS;
  protected readonly expenseColumns = EXPENSE_COLUMNS;
  protected readonly activityColumns = ACTIVITY_COLUMNS;

  /** The admin endpoint is admin-only; other roles get their own dashboards later. */
  protected readonly isAdmin = computed(() => this.auth.role() === Role.Admin);

  protected readonly quickActions = computed(() => {
    const role = this.auth.role();
    return QUICK_ACTIONS.filter((a) => role && findNavItem(a.route)?.roles.includes(role));
  });

  /** The period lives in the URL (?period=quarter) so it survives reloads and can be shared. */
  protected readonly period = toSignal(this.route.queryParamMap.pipe(map((p) => toPeriod(p.get('period')))), {
    initialValue: toPeriod(this.route.snapshot.queryParamMap.get('period')),
  });

  private readonly reload$ = new Subject<void>();
  protected readonly state = signal<LoadState>({ status: 'loading', data: null });
  protected readonly data = computed(() => this.state().data);
  protected readonly refreshing = computed(() => this.state().status === 'loading' && !!this.state().data);

  // ---- Derived display values --------------------------------------------------------------------
  protected readonly comparison = computed(() => PERIOD_COMPARISON[this.period()]);
  protected readonly periodNoun = computed(() => PERIOD_NOUN[this.period()]);

  /** "+12.4%" / "-3.1%", or null when there is no comparison (All, or nothing last period). */
  protected readonly delta = computed(() => {
    const pct = this.data()?.kpis.received_delta_pct;
    if (pct === null || pct === undefined) {
      return null;
    }
    const negative = pct.startsWith('-');
    return { text: `${negative ? '' : '+'}${pct}%`, negative };
  });

  protected readonly receivedSparkLabel = computed(() => this.trendLabel('Received', this.data()?.trends.received, true));
  protected readonly leadsSparkLabel = computed(() => this.trendLabel('New leads', this.data()?.trends.leads_new, false));

  protected readonly funnelRows = computed<BarRow[]>(() =>
    (this.data()?.funnel ?? []).map((s) => ({ label: s.label, value: s.count, display: String(s.count) })),
  );

  protected readonly salesRows = computed<BarRow[]>(() =>
    (this.data()?.sales_by_exec ?? []).map((s) => ({
      label: s.name,
      value: Number(s.won_value) || 0,
      display: `${formatInrCompact(s.won_value)} · ${s.won_count} won`,
    })),
  );

  protected readonly recentPayments = computed(() => (this.data()?.recent.payments ?? []) as unknown as DataRow[]);
  protected readonly recentExpenses = computed(() => (this.data()?.recent.expenses ?? []) as unknown as DataRow[]);
  protected readonly recentActivity = computed(() => (this.data()?.recent.activity ?? []) as unknown as DataRow[]);

  constructor() {
    const today = new Date();
    this.layout.subtitle.set(
      today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    );
    inject(DestroyRef).onDestroy(() => this.layout.subtitle.set(''));

    combineLatest([toObservable(this.period), this.reload$.pipe(startWith(undefined))])
      .pipe(
        switchMap(([period]) => {
          if (!this.isAdmin()) {
            return of<LoadState>({ status: 'loading', data: null });
          }
          return this.service.loadAdmin(period).pipe(
            map((data): LoadState => ({ status: 'ready', data })),
            catchError(() => of<LoadState>({ status: 'error', data: null })),
            startWith<LoadState>({ status: 'loading', data: this.state().data }),
          );
        }),
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

  private trendLabel(name: string, values: (string | number)[] | undefined, money: boolean): string {
    const months = this.data()?.trends.months ?? [];
    const parts = (values ?? []).map(
      (v, i) => `${monthLabel(months[i] ?? '')} ${money ? formatInrCompact(String(v)) : v}`,
    );
    return `${name} per month, last ${parts.length} months: ${parts.join(', ')}`;
  }
}
