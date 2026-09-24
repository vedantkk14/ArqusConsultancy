import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { AccountsApi } from '../data/accounts-api.service';
import { LedgerRow, Statement } from '../data/account.models';
import { formatDay } from '../ui/business-time';
import { PRINT_CSS, enablePrintMode } from '../ui/print';

/**
 * Customer statement: deal total, every active payment as a credit and the running balance. It reads only the
 * statement endpoint, so it can never show the sanctioned budget, expenses or margin. `?ledger=<id>` preselects.
 */
@Component({
  selector: 'app-statement-page',
  imports: [EmptyState, ErrorState, InrPipe, MatButtonModule, MatIconModule, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './statement-page.html',
  styleUrl: './statement-page.scss',
  styles: PRINT_CSS,
})
export class StatementPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AccountsApi);
  private readonly snack = inject(MatSnackBar);

  private readonly queryMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly ledgerId = computed(() => Number(this.queryMap().get('ledger')) || null);
  protected readonly from = computed(() => this.queryMap().get('from') ?? '');
  protected readonly to = computed(() => this.queryMap().get('to') ?? '');

  protected readonly search = signal('');
  protected readonly options = signal<LedgerRow[]>([]);
  protected readonly statement = signal<Statement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly day = formatDay;

  constructor() {
    enablePrintMode(inject(DestroyRef));
    this.searchClients('');
    const id = this.ledgerId();
    if (id) {
      this.load();
    }
  }

  // ---- Client and period (URL is the source of truth) -----------------------------------------------

  protected searchClients(q: string): void {
    this.search.set(q);
    this.api.ledgers({ q: q.trim(), finalized: 'true', page_size: 8, ordering: 'client' }).subscribe({
      next: (res) => this.options.set(res.results),
      error: () => this.options.set([]),
    });
  }

  protected pick(row: LedgerRow): void {
    this.navigate({ ledger: String(row.id) });
  }

  protected clear(): void {
    this.statement.set(null);
    this.navigate({ ledger: '', from: '', to: '' });
  }

  protected setPeriod(key: 'from' | 'to', value: string): void {
    this.navigate({ [key]: value });
  }

  private navigate(patch: Record<string, string>): void {
    const queryParams = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === '' ? null : v]));
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' }).then(() => this.load());
  }

  protected load(): void {
    const id = this.ledgerId();
    if (!id) {
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    this.api.statement(id, this.from(), this.to()).subscribe({
      next: (s) => {
        this.statement.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  // ---- Output ------------------------------------------------------------------------------------------

  protected print(): void {
    window.print();
  }

  protected exportCsv(): void {
    const id = this.ledgerId();
    if (!id) {
      return;
    }
    this.api.statementCsv(id, this.from(), this.to()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'statement.csv';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open("Couldn't export the statement. Try again.", 'Dismiss', { duration: 5000 }),
    });
  }
}
