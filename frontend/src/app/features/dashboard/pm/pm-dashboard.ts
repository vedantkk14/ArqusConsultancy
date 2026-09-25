import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  TemplateRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  MatBottomSheet,
  MatBottomSheetModule,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, catchError, interval, map, of, startWith, switchMap, tap } from 'rxjs';
import { LayoutService } from '../../../layout/layout.service';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { AddExpenseForm, ExpenseProject } from '../../projects/components/add-expense-form';
import { DialogHead } from '../../projects/ui/dialog-head';
import { PanelHead } from '../../projects/ui/panel-head';
import { PmActivityList } from './activity-list';
import { PmAlertRow } from './alert-row';
import { PmExpenseRow } from './expense-row';
import { PmDashboard, PmProject } from './pm-dashboard.models';
import { PmDashboardService } from './pm-dashboard.service';
import { PmProjectCard } from './project-card';

/** Cards shown before "Show all". A PM normally has 1-5 projects. */
export const PROJECT_REVEAL_AFTER = 12;
const PICKER_TITLE_ID = 'pm-pick-title';
const EXPENSE_TITLE_ID = 'ae-title';

type LoadState =
  | { status: 'loading'; data: PmDashboard | null }
  | { status: 'ready'; data: PmDashboard }
  | { status: 'error'; data: PmDashboard | null };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The project manager's home: budget alerts, their projects, quick expense entry, recent expenses and activity. */
@Component({
  selector: 'app-pm-dashboard',
  imports: [
    AddExpenseForm,
    DialogHead,
    EmptyState,
    ErrorState,
    InrPipe,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule,
    PanelHead,
    PmActivityList,
    PmAlertRow,
    PmExpenseRow,
    PmProjectCard,
    Skeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pm-dashboard.html',
  styleUrl: './pm-dashboard.scss',
})
export class PmDashboardPage {
  private readonly service = inject(PmDashboardService);
  private readonly dialog = inject(MatDialog);
  private readonly sheet = inject(MatBottomSheet);
  private readonly snack = inject(MatSnackBar);
  protected readonly layout = inject(LayoutService);

  private readonly reload$ = new Subject<void>();
  protected readonly state = signal<LoadState>({ status: 'loading', data: null });
  protected readonly data = computed(() => this.state().data);
  protected readonly refreshing = computed(
    () => this.state().status === 'loading' && !!this.state().data,
  );
  private readonly loadedAt = signal<Date | null>(null);
  protected readonly now = toSignal(interval(30_000).pipe(map(() => new Date())), {
    initialValue: new Date(),
  });
  protected readonly updatedText = computed(() => {
    const at = this.loadedAt();
    if (!at) {
      return 'Loading';
    }
    const minutes = Math.floor((this.now().getTime() - at.getTime()) / 60_000);
    return minutes < 1 ? 'Updated just now' : `Updated ${minutes} min ago`;
  });

  protected readonly showAll = signal(false);
  protected readonly projects = computed(() => this.data()?.projects ?? []);
  protected readonly visibleProjects = computed(() =>
    this.showAll() ? this.projects() : this.projects().slice(0, PROJECT_REVEAL_AFTER),
  );
  protected readonly hiddenCount = computed(
    () => this.projects().length - this.visibleProjects().length,
  );
  protected readonly running = computed(() =>
    this.projects().filter((p) => p.status === 'RUNNING'),
  );
  protected readonly alerts = computed(() => this.data()?.alerts ?? []);
  protected readonly canAdd = computed(() => this.running().length > 0);

  /** Composed from what is already loaded; zero parts are skipped. */
  protected readonly insight = computed(() => {
    const d = this.data();
    if (!d) {
      return '';
    }
    const over = d.alerts.filter((a) => a.state === 'over').length;
    const warn = d.alerts.length - over;
    const today = d.recent_expenses.filter(
      (e) => e.spent_on === d.business_date && !e.is_void,
    ).length;
    const parts = [
      over ? `${plural(over, 'project', 'projects')} over budget` : '',
      warn ? `${plural(warn, 'project', 'projects')} near its limit` : '',
      today ? `${plural(today, 'expense', 'expenses')} logged today` : '',
    ].filter(Boolean);
    if (!parts.length) {
      return d.projects.length ? 'All projects are within budget' : '';
    }
    return parts.join(' · ');
  });

  // ---- Quick add ----------------------------------------------------------------------------------
  protected readonly pickerTitleId = PICKER_TITLE_ID;
  protected readonly expenseTitleId = EXPENSE_TITLE_ID;
  protected readonly target = signal<ExpenseProject | null>(null);
  private readonly pickerTpl = viewChild.required<TemplateRef<unknown>>('picker');
  private readonly expenseTpl = viewChild.required<TemplateRef<unknown>>('expenseForm');
  private ref: MatDialogRef<unknown> | MatBottomSheetRef | null = null;

  constructor() {
    const today = new Date();
    this.layout.subtitle.set(
      today.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    );
    inject(DestroyRef).onDestroy(() => this.layout.subtitle.set(''));

    this.reload$
      .pipe(
        startWith(undefined),
        switchMap(() =>
          this.service.load().pipe(
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

  protected reload(): void {
    this.reload$.next();
  }

  /** One running project opens the form for it; two or more ask which one first. */
  protected quickAdd(): void {
    const running = this.running();
    if (running.length === 1) {
      this.openExpense(running[0]);
    } else if (running.length > 1) {
      this.open(this.pickerTpl(), 'Choose a project');
    }
  }

  protected openExpense(project: PmProject): void {
    this.closeOverlay();
    this.target.set({ id: project.id, name: project.name, remaining: project.remaining });
    this.open(this.expenseTpl(), 'Add expense', '#ae-amount');
  }

  protected closeOverlay(): void {
    const ref = this.ref;
    this.ref = null;
    if (ref && 'close' in ref) {
      ref.close();
    } else {
      ref?.dismiss();
    }
  }

  protected onSaved(): void {
    this.closeOverlay();
    this.snack.open('Expense added', undefined, { duration: 2500 });
    this.reload();
  }

  private open(tpl: TemplateRef<unknown>, label: string, autoFocus = 'first-tabbable'): void {
    if (this.layout.isDesktop()) {
      const ref = this.dialog.open(tpl, {
        width: '520px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '92vh',
        ariaLabel: label,
        autoFocus,
      });
      ref.afterClosed().subscribe(() => (this.ref = this.ref === ref ? null : this.ref));
      this.ref = ref;
    } else {
      const ref = this.sheet.open(tpl, { ariaLabel: label });
      ref.afterDismissed().subscribe(() => (this.ref = this.ref === ref ? null : this.ref));
      this.ref = ref;
    }
  }
}
