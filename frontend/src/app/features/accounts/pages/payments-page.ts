import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ProofViewer, ProofViewerData } from '../components/dialogs/proof-viewer';
import { ReasonDialog, ReasonDialogData } from '../components/dialogs/reason-dialog';
import { PaymentFiltersBar } from '../components/payment-filters';
import { PaymentLauncher } from '../components/payment-launcher';
import { PaymentAction, PaymentRows } from '../components/payment-rows';
import { AccountsApi } from '../data/accounts-api.service';
import { EMPTY_PAYMENT_FILTERS, PaymentFilters } from '../data/account.models';
import { PaymentsListStore, filtersFromQuery, toQuery } from '../data/payments-list.store';
import { dialogConfig } from '../ui/open';

/**
 * Payment entries: every payment across clients, with totals by mode for the current filters.
 * `?new=1` opens Record payment straight away, and `?new=1&ledger=<id>` with that client chosen.
 */
@Component({
  selector: 'app-payments-page',
  imports: [EmptyState, ErrorState, InrPipe, MatButtonModule, MatIconModule, PaymentFiltersBar, PaymentRows, Skeleton],
  providers: [PaymentsListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payments-page.html',
  styleUrl: './payments-page.scss',
})
export class PaymentsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AccountsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly launcher = inject(PaymentLauncher);
  protected readonly store = inject(PaymentsListStore);

  private readonly queryMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly filters = computed(() => filtersFromQuery((k) => this.queryMap().get(k)));
  protected readonly query = computed(() => toQuery(this.filters()), {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });

  protected readonly countText = computed(() => {
    const n = this.store.count();
    return this.store.loaded() ? `${n} ${n === 1 ? 'payment' : 'payments'}` : 'Loading…';
  });
  protected readonly hasFilters = computed(() =>
    Object.entries(this.filters()).some(([key, value]) => key !== 'ordering' && value !== ''),
  );
  /** Bar geometry only: each mode's share of the biggest one. */
  protected readonly bars = computed(() => {
    const rows = this.store.summary()?.by_mode ?? [];
    const top = Math.max(...rows.map((r) => Number(r.total)), 0);
    return rows.map((r) => ({ ...r, width: top > 0 ? Math.max(2, (Number(r.total) / top) * 100) : 0 }));
  });

  constructor() {
    effect(() => {
      const query = this.query();
      untracked(() => this.store.load(query));
    });
    if (this.route.snapshot.queryParamMap.get('new') === '1') {
      this.openFromLink();
    }
  }

  // ---- Filters (URL is the source of truth) ---------------------------------------------------------

  protected setFilters(patch: Partial<PaymentFilters>): void {
    this.navigate(patch);
  }

  protected clearFilters(): void {
    this.navigate({ ...EMPTY_PAYMENT_FILTERS });
  }

  private navigate(patch: Record<string, string>): void {
    const queryParams = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === '' ? null : v]));
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  // ---- Actions --------------------------------------------------------------------------------------

  /** `?new=1` (and `?ledger=<id>`): open the form, then drop `new` so a refresh does not reopen it. */
  private openFromLink(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('ledger'));
    const done = () => void this.router.navigate([], { relativeTo: this.route, queryParams: { new: null }, queryParamsHandling: 'merge', replaceUrl: true });
    if (!id) {
      done();
      this.recordPayment();
      return;
    }
    this.api.ledger(id).subscribe({
      next: (l) => {
        done();
        this.launcher
          .open({ id: l.id, client: l.client, phone: l.phone, total: l.total, outstanding: l.outstanding })
          .subscribe((payment) => payment && this.store.reload());
      },
      error: () => {
        done();
        this.recordPayment();
      },
    });
  }

  protected recordPayment(): void {
    this.launcher.open().subscribe((payment) => payment && this.store.reload());
  }

  protected onAction(action: PaymentAction): void {
    const p = action.payment;
    if (action.kind === 'proof') {
      this.dialog.open<ProofViewer, ProofViewerData>(ProofViewer, dialogConfig({ payment: p }, { width: '760px', maxWidth: 'calc(100vw - 32px)' }));
      return;
    }
    this.dialog
      .open<ReasonDialog, ReasonDialogData, unknown>(
        ReasonDialog,
        dialogConfig<ReasonDialogData>({
          title: 'Void payment',
          subtitle: `${p.receipt_no} · ${p.client}`,
          prompt: 'Why is this payment being voided?',
          confirmText: 'Void payment',
          action: (reason) => this.api.voidPayment(p.id, reason),
        }),
      )
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open('Payment voided.', undefined, { duration: 2500 });
          this.store.reload();
        }
      });
  }

  protected exportCsv(): void {
    this.api.exportPayments(this.query()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'payments.csv';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open("Couldn't export the payments. Try again.", 'Dismiss', { duration: 5000 }),
    });
  }
}
