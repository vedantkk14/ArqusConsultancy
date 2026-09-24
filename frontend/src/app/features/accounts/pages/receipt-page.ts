import { ChangeDetectionStrategy, Component, DestroyRef, ViewEncapsulation, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { AccountsApi } from '../data/accounts-api.service';
import { Payment } from '../data/account.models';
import { formatDay } from '../ui/business-time';
import { PRINT_CSS, enablePrintMode } from '../ui/print';

/** A payment receipt: number, date, client, amount in figures and words, mode, balance after, signature line. */
@Component({
  selector: 'app-receipt-page',
  imports: [EmptyState, ErrorState, InrPipe, MatButtonModule, MatIconModule, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './receipt-page.scss',
  styles: PRINT_CSS,
  template: `
    <div class="bar no-print">
      <a class="back" [routerLink]="payment() ? ['/accounts/ledgers', payment()!.ledger] : '/accounts/payments'">
        <mat-icon aria-hidden="true">arrow_back</mat-icon>{{ payment() ? payment()!.client : 'Payment entries' }}
      </a>
      @if (payment()) {
        <button matButton="filled" type="button" (click)="print()"><mat-icon>print</mat-icon>Print receipt</button>
      }
    </div>

    @if (error()) {
      <app-error-state class="no-print" title="Couldn't load the receipt" (retry)="load()" />
    } @else if (notFound()) {
      <app-empty-state class="no-print" icon="receipt_long" title="Receipt not found" message="This payment does not exist.">
        <a matButton="filled" routerLink="/accounts/payments">Back to payments</a>
      </app-empty-state>
    } @else if (payment(); as p) {
      <article class="card rc print-doc" aria-label="Payment receipt">
        <header class="rc-head">
          <img src="brand/arqus-logo.png" alt="ARQUS Sports Consultancy" width="132" height="78" />
          <div class="rc-title">
            <h2>Payment receipt</h2>
            <p class="num">{{ p.receipt_no }}</p>
          </div>
        </header>
        @if (p.is_void) {
          <p class="rc-void" role="status">Void: {{ p.void_reason }}</p>
        }
        <dl class="rc-grid">
          <div>
            <dt>Received from</dt>
            <dd>{{ p.client }}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{{ day(p.received_on) }}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>{{ p.mode_label }}{{ p.reference ? ' · ' + p.reference : '' }}</dd>
          </div>
          <div>
            <dt>Balance after this payment</dt>
            <dd class="num">{{ p.balance_after ? (p.balance_after | inr: 'paise') : '—' }}</dd>
          </div>
        </dl>
        <div class="rc-amount">
          <span class="lbl">Amount received</span>
          <strong class="num">{{ p.amount | inr: 'paise' }}</strong>
          <span class="words">{{ p.amount_in_words }}</span>
        </div>
        @if (p.note) {
          <p class="rc-note">{{ p.note }}</p>
        }
        <footer class="rc-sign">
          <span>Received by {{ p.recorded_by?.name ?? '—' }}</span>
          <span class="line">Authorised signature</span>
        </footer>
      </article>
    } @else {
      <section class="card rc" aria-hidden="true">
        <app-skeleton width="40%" height="20px" />
        <app-skeleton height="120px" radius="12px" />
      </section>
    }
  `,
})
export class ReceiptPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AccountsApi);

  protected readonly payment = signal<Payment | null>(null);
  protected readonly error = signal(false);
  protected readonly notFound = signal(false);
  protected readonly day = formatDay;

  constructor() {
    enablePrintMode(inject(DestroyRef));
    this.load();
  }

  protected load(): void {
    this.error.set(false);
    this.api.payment(Number(this.route.snapshot.paramMap.get('id'))).subscribe({
      next: (p) => this.payment.set(p),
      error: (err) => (err.status === 404 ? this.notFound.set(true) : this.error.set(true)),
    });
  }

  protected print(): void {
    window.print();
  }
}
