import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatBottomSheet, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { LayoutService } from '../../../layout/layout.service';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { AddExpenseForm } from '../components/add-expense-form';
import { BudgetPanel } from '../components/budget-panel';
import { BudgetDialog, BudgetDialogData } from '../components/dialogs/budget-dialog';
import { CompleteDialog, CompleteDialogData } from '../components/dialogs/complete-dialog';
import { ReasonDialog, ReasonDialogData } from '../components/dialogs/reason-dialog';
import { ReassignDialog, ReassignDialogData } from '../components/dialogs/reassign-dialog';
import { ReceiptViewer, ReceiptViewerData } from '../components/dialogs/receipt-viewer';
import { ExpenseAction, ExpenseRows } from '../components/expense-rows';
import { ProjectTimeline } from '../components/project-timeline';
import { EXPENSE_CATEGORIES, Expense, ProjectAction, ProjectDetail, STATE_TINT } from '../data/project.models';
import { ProjectsApi } from '../data/projects-api.service';
import { BudgetStateChip, PersonAvatar } from '../ui/bits';
import { formatBusinessFull, formatDay, relativeLabel } from '../ui/business-time';
import { DialogHead } from '../ui/dialog-head';
import { PanelHead } from '../ui/panel-head';
import { dialogConfig } from '../ui/open';

const PAGE_SIZE = 20;
const EXPENSE_TITLE_ID = 'ae-title';

/** One project: budget, (admin) finance, expenses and the timeline. A PM's DOM never contains the finance panel. */
@Component({
  selector: 'app-project-detail-page',
  imports: [
    AddExpenseForm,
    BudgetPanel,
    BudgetStateChip,
    DialogHead,
    EmptyState,
    ErrorState,
    ExpenseRows,
    InrPipe,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    PanelHead,
    PersonAvatar,
    ProjectTimeline,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-detail-page.html',
  styleUrl: './project-detail-page.scss',
})
export class ProjectDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ProjectsApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly sheet = inject(MatBottomSheet);
  private readonly snack = inject(MatSnackBar);
  protected readonly layout = inject(LayoutService);

  private readonly resolved = toSignal(this.route.data.pipe(map((d) => (d['project'] as ProjectDetail | null) ?? null)), {
    initialValue: (this.route.snapshot.data['project'] as ProjectDetail | null) ?? null,
  });
  private readonly updated = signal<ProjectDetail | null>(null);
  protected readonly project = computed(() => {
    const fresh = this.updated();
    const base = this.resolved();
    return fresh && base && fresh.id === base.id ? fresh : base;
  });
  protected readonly timelineTick = signal(0);

  protected readonly isAdmin = computed(() => this.auth.role() === Role.Admin);
  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });
  protected readonly glow = computed(() => STATE_TINT[this.project()?.state ?? 'ok']);
  protected readonly running = computed(() => this.project()?.status === 'RUNNING');
  protected readonly back = computed(() =>
    this.project()?.status === 'COMPLETED'
      ? { link: '/projects/completed', label: 'Completed projects' }
      : { link: '/projects/running', label: this.isAdmin() ? 'Running projects' : 'My projects' },
  );
  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly full = formatBusinessFull;
  protected readonly day = formatDay;
  protected readonly rel = relativeLabel;

  // ---- Expenses panel ------------------------------------------------------------------------------
  protected readonly category = signal('');
  protected readonly expenses = signal<Expense[]>([]);
  protected readonly expenseCount = signal(0);
  protected readonly expensesLoading = signal(true);
  protected readonly expensesLoaded = signal(false);
  protected readonly expensesError = signal(false);
  private expensePage = 1;

  // ---- Expense form (dialog on desktop, bottom sheet on phones) ------------------------------------
  protected readonly editing = signal<Expense | null>(null);
  protected readonly expenseTitleId = EXPENSE_TITLE_ID;
  private readonly expenseTpl = viewChild.required<TemplateRef<unknown>>('expenseForm');
  private expenseDialog: MatDialogRef<unknown> | null = null;
  private expenseSheet: MatBottomSheetRef | null = null;

  constructor() {
    this.loadExpenses(1);
  }

  protected can(action: ProjectAction): boolean {
    return !!this.project()?.allowed_actions.includes(action);
  }

  // ---- Data ------------------------------------------------------------------------------------------

  protected loadExpenses(page: number): void {
    const project = this.project();
    if (!project) {
      return;
    }
    this.expensesLoading.set(true);
    this.expensesError.set(false);
    this.api.projectExpenses(project.id, { page, page_size: PAGE_SIZE, category: this.category() }).subscribe({
      next: (res) => {
        this.expensePage = page;
        this.expenseCount.set(res.count);
        this.expenses.update((rows) => (page === 1 ? res.results : [...rows, ...res.results]));
        this.expensesLoading.set(false);
        this.expensesLoaded.set(true);
      },
      error: () => {
        this.expensesError.set(true);
        this.expensesLoading.set(false);
      },
    });
  }

  protected loadMoreExpenses(): void {
    if (!this.expensesLoading() && this.expenses().length < this.expenseCount()) {
      this.loadExpenses(this.expensePage + 1);
    }
  }

  protected setCategory(value: string): void {
    this.category.set(value);
    this.loadExpenses(1);
  }

  protected refresh(): void {
    const project = this.project();
    if (!project) {
      return;
    }
    this.api.get(project.id).subscribe((fresh) => this.updated.set(fresh));
    this.timelineTick.update((n) => n + 1);
    this.loadExpenses(1);
  }

  private apply(fresh: ProjectDetail | null | undefined): void {
    if (fresh) {
      this.updated.set(fresh);
      this.timelineTick.update((n) => n + 1);
      this.loadExpenses(1);
    }
  }

  // ---- Expense form ---------------------------------------------------------------------------------

  protected addExpense(expense: Expense | null = null): void {
    this.editing.set(expense);
    if (this.layout.isDesktop()) {
      this.expenseDialog = this.dialog.open(this.expenseTpl(), {
        width: '520px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '92vh',
        ariaLabelledBy: EXPENSE_TITLE_ID,
        autoFocus: '#ae-amount',
      });
      this.expenseDialog.afterClosed().subscribe(() => (this.expenseDialog = null));
    } else {
      this.expenseSheet = this.sheet.open(this.expenseTpl(), { ariaLabel: expense ? 'Edit expense' : 'Add expense' });
      this.expenseSheet.afterDismissed().subscribe(() => (this.expenseSheet = null));
    }
  }

  protected closeExpense(): void {
    this.expenseDialog?.close();
    this.expenseSheet?.dismiss();
  }

  protected onExpenseSaved(): void {
    const edited = this.editing() !== null;
    this.closeExpense();
    this.snack.open(edited ? 'Expense updated.' : 'Expense added.', undefined, { duration: 2500 });
    this.refresh();
  }

  protected onExpenseAction(action: ExpenseAction): void {
    const e = action.expense;
    if (action.kind === 'receipt') {
      this.dialog.open<ReceiptViewer, ReceiptViewerData>(ReceiptViewer, dialogConfig({ expense: e }, { width: '760px', maxWidth: 'calc(100vw - 32px)' }));
    } else if (action.kind === 'edit') {
      this.addExpense(e);
    } else {
      this.dialog
        .open<ReasonDialog, ReasonDialogData, Expense | boolean>(
          ReasonDialog,
          dialogConfig<ReasonDialogData>({
            title: 'Void expense',
            subtitle: `${e.category_label} · ${e.vendor || 'no vendor'}`,
            prompt: 'Why is this expense being voided?',
            confirmText: 'Void expense',
            action: (reason) => this.api.voidExpense(e.id, reason),
          }),
        )
        .afterClosed()
        .subscribe((done) => {
          if (done) {
            this.snack.open('Expense voided.', undefined, { duration: 2500 });
            this.refresh();
          }
        });
    }
  }

  // ---- Project actions --------------------------------------------------------------------------------

  protected complete(project: ProjectDetail): void {
    this.dialog
      .open<CompleteDialog, CompleteDialogData, ProjectDetail>(CompleteDialog, dialogConfig({ project }))
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open(`${project.name} completed.`, undefined, { duration: 3000 });
          this.apply(done);
        }
      });
  }

  protected reopen(project: ProjectDetail): void {
    this.dialog
      .open<ReasonDialog, ReasonDialogData, ProjectDetail>(
        ReasonDialog,
        dialogConfig<ReasonDialogData>({
          title: 'Reopen project',
          subtitle: project.name,
          prompt: 'Why are you reopening it?',
          confirmText: 'Reopen project',
          action: (reason) => this.api.reopen(project.id, reason),
        }),
      )
      .afterClosed()
      .subscribe((done) => {
        if (done && typeof done === 'object') {
          this.snack.open(`${project.name} reopened.`, undefined, { duration: 3000 });
          this.apply(done);
        }
      });
  }

  protected adjustBudget(project: ProjectDetail): void {
    this.dialog
      .open<BudgetDialog, BudgetDialogData, ProjectDetail>(
        BudgetDialog,
        dialogConfig({ project, max: project.finance?.total_amount ?? null }),
      )
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open('Budget updated.', undefined, { duration: 3000 });
          this.apply(done);
        }
      });
  }

  protected reassign(project: ProjectDetail): void {
    this.dialog
      .open<ReassignDialog, ReassignDialogData, ProjectDetail>(
        ReassignDialog,
        dialogConfig({ project: { id: project.id, name: project.name, pm: project.pm ?? null } }),
      )
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open(done.pm ? `${done.pm.name} is now managing ${project.name}.` : 'Project manager removed.', undefined, { duration: 3000 });
          this.apply(done);
        }
      });
  }

  protected isNegative(value: string | null | undefined): boolean {
    return !!value && value.startsWith('-');
  }
}
