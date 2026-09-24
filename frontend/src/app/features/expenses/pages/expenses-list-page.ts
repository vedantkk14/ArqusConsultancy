import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ReasonDialog, ReasonDialogData } from '../../projects/components/dialogs/reason-dialog';
import { ReceiptViewer, ReceiptViewerData } from '../../projects/components/dialogs/receipt-viewer';
import { ExpenseAction, ExpenseRows } from '../../projects/components/expense-rows';
import { EMPTY_EXPENSE_FILTERS, Expense, ExpenseFilters, Manager } from '../../projects/data/project.models';
import { ProjectsApi } from '../../projects/data/projects-api.service';
import { dialogConfig } from '../../projects/ui/open';
import { ExpenseFiltersBar, ProjectOption } from '../components/expense-filters';
import { ExpensesListStore, filtersFromQuery, toQuery } from '../expenses-list.store';

/** All expenses (admin) / My expenses (project manager). Totals come from the server for the current filters. */
@Component({
  selector: 'app-expenses-list-page',
  imports: [EmptyState, ErrorState, ExpenseFiltersBar, ExpenseRows, InrPipe, MatButtonModule, MatIconModule, Skeleton],
  providers: [ExpensesListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './expenses-list-page.html',
  styleUrl: './expenses-list-page.scss',
})
export class ExpensesListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ProjectsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly store = inject(ExpensesListStore);

  protected readonly isAdmin = computed(() => this.auth.role() === Role.Admin);

  private readonly queryMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly filters = computed(() => filtersFromQuery((k) => this.queryMap().get(k)));
  protected readonly query = computed(() => toQuery(this.filters()), {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });
  protected readonly projects = signal<ProjectOption[]>([]);
  protected readonly managers = signal<Manager[]>([]);

  protected readonly countText = computed(() => {
    const n = this.store.count();
    return this.store.loaded() ? `${n} ${n === 1 ? 'expense' : 'expenses'}` : 'Loading…';
  });
  protected readonly hasFilters = computed(() =>
    Object.entries(this.filters()).some(([key, value]) => key !== 'ordering' && value !== ''),
  );
  /** Bar geometry only: each category's share of the biggest one. */
  protected readonly bars = computed(() => {
    const rows = this.store.summary()?.by_category ?? [];
    const top = Math.max(...rows.map((r) => Number(r.total)), 0);
    return rows.map((r) => ({ ...r, width: top > 0 ? Math.max(2, (Number(r.total) / top) * 100) : 0 }));
  });

  constructor() {
    effect(() => {
      const query = this.query();
      untracked(() => this.store.load(query));
    });
    this.api.list({ ordering: 'name', page_size: 100 }).subscribe({
      next: (res) => this.projects.set(res.results.map((p) => ({ id: p.id, name: p.name }))),
      error: () => undefined,
    });
    if (this.isAdmin()) {
      this.api.managers().subscribe({ next: (list) => this.managers.set(list), error: () => undefined });
    }
  }

  // ---- Filters (URL is the source of truth) ---------------------------------------------------------

  protected setFilters(patch: Partial<ExpenseFilters>): void {
    this.navigate(patch);
  }

  protected clearFilters(): void {
    this.navigate({ ...EMPTY_EXPENSE_FILTERS });
  }

  private navigate(patch: Record<string, string>): void {
    const queryParams = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === '' ? null : v]));
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  // ---- Actions --------------------------------------------------------------------------------------

  protected onAction(action: ExpenseAction): void {
    const e = action.expense;
    if (action.kind === 'receipt') {
      this.dialog.open<ReceiptViewer, ReceiptViewerData>(ReceiptViewer, dialogConfig({ expense: e }, { width: '760px', maxWidth: 'calc(100vw - 32px)' }));
    } else if (action.kind === 'void') {
      this.voidExpense(e);
    }
  }

  private voidExpense(e: Expense): void {
    this.dialog
      .open<ReasonDialog, ReasonDialogData, unknown>(
        ReasonDialog,
        dialogConfig<ReasonDialogData>({
          title: 'Void expense',
          subtitle: `${e.category_label} · ${e.vendor || 'no vendor'} · ${e.project_name}`,
          prompt: 'Why is this expense being voided?',
          confirmText: 'Void expense',
          action: (reason) => this.api.voidExpense(e.id, reason),
        }),
      )
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open('Expense voided.', undefined, { duration: 2500 });
          this.store.reload();
        }
      });
  }

  protected exportCsv(): void {
    this.api.exportCsv(this.query()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'expenses.csv';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open("Couldn't export the expenses. Try again.", 'Dismiss', { duration: 5000 }),
    });
  }
}
