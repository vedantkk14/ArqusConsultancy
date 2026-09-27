import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, combineLatest, interval, map, merge, of, startWith, switchMap, tap } from 'rxjs';
import { AssignDialog, AssignDialogData } from '../../leads/components/dialogs/assign-dialog';
import { WhatsAppDialog, WhatsAppDialogData } from '../../leads/components/dialogs/whatsapp-dialog';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ActivityCard } from '../components/activity-card';
import { CountUp } from '../components/count-up';
import { PeriodSwitcher } from '../components/period-switcher';
import { RadialGauge } from '../components/radial-gauge';
import { RecentActivity } from '../dashboard.models';
import { LayoutService } from '../../../layout/layout.service';
import { ByExecutiveList } from './components/by-executive-list';
import { QueueSection } from './components/queue-section';
import { PERIOD_NOUN, Period, QueueLeadItem, SalesManagerDashboard, toPeriod } from './sales-manager-dashboard.models';
import { SalesManagerDashboardService } from './sales-manager-dashboard.service';

type LoadState =
  | { status: 'loading'; data: SalesManagerDashboard | null }
  | { status: 'ready'; data: SalesManagerDashboard }
  | { status: 'error'; data: null };

/** Auto-refresh cadence while a manager is sitting on this page (leads change under them). */
const POLL_MS = 45_000;

/** What an interaction's `type` reads like in a one-line activity sentence. */
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
  selector: 'app-sales-manager-dashboard-page',
  imports: [
    ActivityCard,
    ByExecutiveList,
    CountUp,
    ErrorState,
    InrCompactPipe,
    MatIconModule,
    MatTooltipModule,
    PeriodSwitcher,
    QueueSection,
    RadialGauge,
    RouterLink,
    Skeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-manager-dashboard.page.html',
  styleUrls: ['./sales-manager-dashboard.page.scss', '../kpi-cards.scss'],
})
export class SalesManagerDashboardPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(SalesManagerDashboardService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly layout = inject(LayoutService);

  /** The period lives in the URL (?period=quarter) so it survives reloads and can be shared. */
  protected readonly period = toSignal(
    this.route.queryParamMap.pipe(map((p) => toPeriod(p.get('period')))),
    { initialValue: toPeriod(this.route.snapshot.queryParamMap.get('period')) },
  );
  protected readonly periodNoun = computed(() => PERIOD_NOUN[this.period()]);

  private readonly reload$ = new Subject<void>();
  protected readonly state = signal<LoadState>({ status: 'loading', data: null });
  protected readonly data = computed(() => this.state().data);
  protected readonly refreshing = computed(() => this.state().status === 'loading' && !!this.data());

  /** "Updated N min ago": loaded-at time plus a clock that ticks every 30s (same pattern as the admin dashboard). */
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

  protected readonly activityRows = computed<RecentActivity[]>(() =>
    (this.data()?.recent_activity ?? []).map((a) => ({
      when: a.at,
      actor: a.exec_name,
      action: `${ACTION_VERB[a.type] ?? 'logged an activity on'} ${a.lead_name}${a.text ? ': ' + a.text : ''}`,
      type: 'lead',
    })),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.layout.subtitle.set(''));
    this.layout.subtitle.set(this.today);

    // Refetch on: a period change, the manual refresh button, a successful assign, and every
    // POLL_MS while the page stays open (leads change under a manager without them clicking anything).
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

  protected openAssign(row: QueueLeadItem): void {
    this.dialog
      .open<AssignDialog, AssignDialogData, boolean>(AssignDialog, {
        width: '480px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
        data: { ids: [row.id], label: row.name },
      })
      .afterClosed()
      .subscribe((assigned) => {
        if (assigned) {
          this.snack.open(`${row.name} assigned.`, undefined, { duration: 4000 });
          this.reload();
        }
      });
  }

  protected openWhatsapp(row: QueueLeadItem): void {
    this.dialog.open<WhatsAppDialog, WhatsAppDialogData>(WhatsAppDialog, {
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'first-tabbable',
      data: { lead: { id: row.id, name: row.name, phone: row.phone } },
    });
  }
}
