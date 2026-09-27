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
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { LedgerFiltersBar } from '../components/ledger-filters';
import { LedgerRows, RowAction } from '../components/ledger-rows';
import { FinalizeDialog, AmountDialogData } from '../components/dialogs/amount-dialogs';
import { PaymentLauncher } from '../components/payment-launcher';
import { AccountsApi } from '../data/accounts-api.service';
import { AgingBucket, EMPTY_FILTERS, LedgerDetail, LedgerFilters, LedgerMode } from '../data/account.models';
import { LedgersListStore, filtersFromQuery, listInsight, toQuery } from '../data/ledgers-list.store';
import { CollectBar } from '../ui/bits';
import { dialogConfig } from '../ui/open';

/** One page for Customer Ledgers (all) and Pending Collections (only ledgers with a balance). Admin only. */
@Component({
  selector: 'app-ledgers-list-page',
  imports: [CollectBar, EmptyState, ErrorState, InrCompactPipe, LedgerFiltersBar, LedgerRows, MatButtonModule, MatIconModule, Skeleton],
  providers: [LedgersListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ledgers-list-page.html',
  styleUrl: './ledgers-list-page.scss',
})
export class LedgersListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AccountsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly launcher = inject(PaymentLauncher);
  protected readonly store = inject(LedgersListStore);

  protected readonly mode: LedgerMode = this.route.snapshot.data['mode'] ?? 'all';

  private readonly queryMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly filters = computed(() => filtersFromQuery((k) => this.queryMap().get(k)));
  protected readonly query = computed(() => toQuery(this.mode, this.filters()), {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });

  protected readonly insight = computed(() => listInsight(this.store.summary()));
  protected readonly countText = computed(() => {
    const n = this.store.count();
    return this.store.loaded() ? `${n} ${this.mode === 'pending' ? 'pending ' : ''}${n === 1 ? 'ledger' : 'ledgers'}` : 'Loading…';
  });
  protected readonly hasFilters = computed(() =>
    Object.entries(this.filters()).some(([key, value]) => key !== 'ordering' && value !== ''),
  );

  constructor() {
    effect(() => {
      const query = this.query();
      untracked(() => this.store.load(query));
    });
  }

  // ---- Filters (URL is the source of truth) ---------------------------------------------------------

  protected setFilters(patch: Partial<LedgerFilters>): void {
    this.navigate(patch);
  }

  protected clearFilters(): void {
    this.navigate({ ...EMPTY_FILTERS });
  }

  protected setAging(bucket: AgingBucket): void {
    this.navigate({ aging: this.filters().aging === bucket ? '' : bucket });
  }

  private navigate(patch: Record<string, string>): void {
    const queryParams = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === '' ? null : v]));
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  // ---- Actions --------------------------------------------------------------------------------------

  protected recordPayment(): void {
    this.launcher.open().subscribe((payment) => payment && this.store.reload());
  }

  protected onAction(action: RowAction): void {
    const row = action.row;
    if (action.kind === 'pay') {
      this.launcher
        .open({ id: row.id, client: row.client, phone: row.phone, total: row.total, outstanding: row.outstanding })
        .subscribe((payment) => payment && this.store.reload());
    } else if (action.kind === 'remind') {
      this.api.reminder(row.id).subscribe({
        next: (r) => {
          window.open(r.url, '_blank', 'noopener');
          this.snack.open(`Reminder for ${row.client} opened in WhatsApp.`, undefined, { duration: 3000 });
        },
        error: (err) => this.snack.open(err.code === 'invalid_phone' ? `${row.client}'s phone number can't be used for WhatsApp.` : err.message, 'Dismiss', { duration: 5000 }),
      });
    } else {
      this.dialog
        .open<FinalizeDialog, AmountDialogData, LedgerDetail | boolean>(
          FinalizeDialog,
          dialogConfig({ ledger: { id: row.id, client: row.client, total: row.total, received: row.received } }),
        )
        .afterClosed()
        .subscribe((done) => {
          if (done) {
            this.snack.open(`${row.client} finalized.`, undefined, { duration: 3500 });
            this.store.reload();
          }
        });
    }
  }

  protected exportCsv(): void {
    this.api.exportLedgers(this.query()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ledgers.csv';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open("Couldn't export the ledgers. Try again.", 'Dismiss', { duration: 5000 }),
    });
  }
}
