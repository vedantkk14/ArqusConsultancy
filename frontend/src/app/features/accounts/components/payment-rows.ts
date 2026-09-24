import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Payment } from '../data/account.models';
import { formatBusinessFull, formatDay } from '../ui/business-time';

export const MODE_TINT: Record<string, string> = {
  CASH: 'teal',
  BANK_TRANSFER: 'cyan',
  UPI: 'cyan',
  CHEQUE: 'amber',
  CARD: 'slate',
  OTHER: 'slate',
};

export interface PaymentAction {
  kind: 'proof' | 'void';
  payment: Payment;
}

/** Payments as a table (>= 768px) or stacked cards (phones). Void rows stay visible with a "Void" tag. */
@Component({
  selector: 'app-payment-rows',
  imports: [InrPipe, MatIconModule, MatMenuModule, NgTemplateOutlet, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payment-rows.html',
  styleUrl: './payment-rows.scss',
})
export class PaymentRows {
  readonly rows = input.required<Payment[]>();
  readonly layout = input<'table' | 'cards'>('table');
  /** The payment entries page shows the client (as a link to the ledger). */
  readonly showClient = input(false);
  readonly skeleton = input(false);
  readonly action = output<PaymentAction>();

  protected readonly placeholders = Array.from({ length: 5 }, (_, i) => i);
  protected readonly day = formatDay;
  protected readonly full = formatBusinessFull;
  protected readonly tint = (mode: string): string => MODE_TINT[mode] ?? 'slate';

  protected label(p: Payment): string {
    return `${p.receipt_no} for ${p.client}`;
  }

  protected emit(kind: PaymentAction['kind'], payment: Payment): void {
    this.action.emit({ kind, payment });
  }
}
