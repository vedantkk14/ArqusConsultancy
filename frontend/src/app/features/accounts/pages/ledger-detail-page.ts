import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { LayoutService } from '../../../layout/layout.service';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { AmountDialogData, FinalizeDialog, ReviseTotalDialog } from '../components/dialogs/amount-dialogs';
import { ProofViewer, ProofViewerData } from '../components/dialogs/proof-viewer';
import { ReasonDialog, ReasonDialogData } from '../components/dialogs/reason-dialog';
import { LedgerTimeline } from '../components/ledger-timeline';
import { PaymentLauncher } from '../components/payment-launcher';
import { PaymentAction, PaymentRows } from '../components/payment-rows';
import { AccountsApi } from '../data/accounts-api.service';
import { LedgerAction, LedgerDetail, Payment, STATE_TINT } from '../data/account.models';
import { LedgerStateChip, OverduePill, PersonAvatar } from '../ui/bits';
import { formatBusinessFull, formatDay, relativeLabel } from '../ui/business-time';
import { dialogConfig } from '../ui/open';
import { PanelHead } from '../ui/panel-head';

const PAGE_SIZE = 20;

/** One ledger: money hero, linked project, payments and the timeline. Admin only. */
@Component({
  selector: 'app-ledger-detail-page',
  imports: [
    EmptyState,
    ErrorState,
    InrPipe,
    LedgerStateChip,
    LedgerTimeline,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    OverduePill,
    PanelHead,
    PaymentRows,
    PersonAvatar,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ledger-detail-page.html',
  styleUrl: './ledger-detail-page.scss',
})
export class LedgerDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AccountsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly launcher = inject(PaymentLauncher);
  protected readonly layout = inject(LayoutService);

  private readonly resolved = toSignal(this.route.data.pipe(map((d) => (d['ledger'] as LedgerDetail | null) ?? null)), {
    initialValue: (this.route.snapshot.data['ledger'] as LedgerDetail | null) ?? null,
  });
  private readonly updated = signal<LedgerDetail | null>(null);
  protected readonly ledger = computed(() => {
    const fresh = this.updated();
    const base = this.resolved();
    return fresh && base && fresh.id === base.id ? fresh : base;
  });
  protected readonly timelineTick = signal(0);

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });
  protected readonly glow = computed(() => STATE_TINT[this.ledger()?.state ?? 'UNPAID']);
  protected readonly full = formatBusinessFull;
  protected readonly day = formatDay;
  protected readonly rel = relativeLabel;

  protected readonly payments = signal<Payment[]>([]);
  protected readonly paymentCount = signal(0);
  protected readonly paymentsLoading = signal(true);
  protected readonly paymentsLoaded = signal(false);
  protected readonly paymentsError = signal(false);
  private paymentPage = 1;

  constructor() {
    this.loadPayments(1);
  }

  protected can(action: LedgerAction): boolean {
    return !!this.ledger()?.allowed_actions.includes(action);
  }

  protected isNegative(value: string | null | undefined): boolean {
    return !!value && value.startsWith('-');
  }

  // ---- Data ------------------------------------------------------------------------------------------

  protected loadPayments(page: number): void {
    const ledger = this.ledger();
    if (!ledger) {
      return;
    }
    this.paymentsLoading.set(true);
    this.paymentsError.set(false);
    this.api.ledgerPayments(ledger.id, { page, page_size: PAGE_SIZE }).subscribe({
      next: (res) => {
        this.paymentPage = page;
        this.paymentCount.set(res.count);
        this.payments.update((rows) => (page === 1 ? res.results : [...rows, ...res.results]));
        this.paymentsLoading.set(false);
        this.paymentsLoaded.set(true);
      },
      error: () => {
        this.paymentsError.set(true);
        this.paymentsLoading.set(false);
      },
    });
  }

  protected loadMorePayments(): void {
    if (!this.paymentsLoading() && this.payments().length < this.paymentCount()) {
      this.loadPayments(this.paymentPage + 1);
    }
  }

  protected refresh(): void {
    const ledger = this.ledger();
    if (!ledger) {
      return;
    }
    this.api.ledger(ledger.id).subscribe((fresh) => this.updated.set(fresh));
    this.timelineTick.update((n) => n + 1);
    this.loadPayments(1);
  }

  // ---- Actions ---------------------------------------------------------------------------------------

  protected recordPayment(ledger: LedgerDetail): void {
    this.launcher
      .open({ id: ledger.id, client: ledger.client, phone: ledger.phone, total: ledger.total, outstanding: ledger.outstanding }, true)
      .subscribe((payment) => payment && this.refresh());
  }

  protected finalize(ledger: LedgerDetail): void {
    this.dialog
      .open<FinalizeDialog, AmountDialogData, LedgerDetail | boolean>(FinalizeDialog, dialogConfig({ ledger }))
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open(`${ledger.client} finalized.`, undefined, { duration: 3500 });
          this.refresh();
        }
      });
  }

  protected reviseTotal(ledger: LedgerDetail): void {
    this.dialog
      .open<ReviseTotalDialog, AmountDialogData, LedgerDetail>(ReviseTotalDialog, dialogConfig({ ledger }))
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open('Total updated.', undefined, { duration: 3000 });
          this.refresh();
        }
      });
  }

  protected remind(ledger: LedgerDetail): void {
    this.api.reminder(ledger.id).subscribe({
      next: (r) => {
        window.open(r.url, '_blank', 'noopener');
        this.snack.open(`Reminder for ${ledger.client} opened in WhatsApp.`, undefined, { duration: 3000 });
        this.timelineTick.update((n) => n + 1);
      },
      error: (err) =>
        this.snack.open(err.code === 'invalid_phone' ? `${ledger.client}'s phone number can't be used for WhatsApp.` : err.message, 'Dismiss', { duration: 5000 }),
    });
  }

  protected onPaymentAction(action: PaymentAction): void {
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
          subtitle: `${p.receipt_no} · ${p.mode_label}`,
          prompt: 'Why is this payment being voided?',
          confirmText: 'Void payment',
          action: (reason) => this.api.voidPayment(p.id, reason),
        }),
      )
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open('Payment voided.', undefined, { duration: 2500 });
          this.refresh();
        }
      });
  }
}
