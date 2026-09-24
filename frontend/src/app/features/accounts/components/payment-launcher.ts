import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Observable, map } from 'rxjs';
import { LedgerOption, Payment } from '../data/account.models';
import { DialogHead } from '../ui/dialog-head';
import { DIALOG_TITLE_ID } from '../ui/open';
import { RecordPaymentForm } from './record-payment-form';

export interface RecordPaymentData {
  ledger: LedgerOption | null;
  locked: boolean;
}

/** The record-payment form inside a dialog (desktop) or a bottom sheet (phones). */
@Component({
  selector: 'app-record-payment-host',
  imports: [DialogHead, RecordPaymentForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.in-sheet]': 'sheet' },
  template: `
    <app-dialog-head
      headingId="dlg-title"
      title="Record payment"
      [subtitle]="data.ledger ? data.ledger.client : 'Money received from a client'"
      (closed)="close()"
    />
    <app-record-payment-form
      [ledger]="data.ledger"
      [locked]="data.locked"
      [inSheet]="true"
      (saved)="close($event)"
      (cancelled)="close()"
    />
  `,
  styles: `
    :host { display: block; box-sizing: border-box; width: min(520px, calc(100vw - 32px)); max-height: 92vh; padding: var(--space-6); overflow-y: auto; }
    :host(.in-sheet) { width: auto; max-height: none; padding: var(--space-2) var(--space-1) 0; }
  `,
})
export class RecordPaymentHost {
  private readonly dialogRef = inject<MatDialogRef<RecordPaymentHost, Payment>>(MatDialogRef, { optional: true });
  private readonly sheetRef = inject<MatBottomSheetRef<RecordPaymentHost, Payment>>(MatBottomSheetRef, { optional: true });
  protected readonly data: RecordPaymentData = (inject(MAT_DIALOG_DATA, { optional: true }) ??
    inject(MAT_BOTTOM_SHEET_DATA, { optional: true })) as RecordPaymentData;
  protected readonly sheet = !this.dialogRef;

  protected close(payment?: Payment): void {
    this.dialogRef?.close(payment);
    this.sheetRef?.dismiss(payment);
  }
}

/**
 * Opens "Record payment" from anywhere: a dialog from 1024px up, a bottom sheet below. On success it shows
 * "Payment recorded." with a "Print receipt" action and emits the saved payment.
 */
@Injectable({ providedIn: 'root' })
export class PaymentLauncher {
  private readonly dialog = inject(MatDialog);
  private readonly sheet = inject(MatBottomSheet);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointObserver);

  open(ledger: LedgerOption | null = null, locked = false): Observable<Payment | undefined> {
    const data: RecordPaymentData = { ledger, locked };
    const closed: Observable<Payment | undefined> = this.breakpoints.isMatched('(min-width: 1024px)')
      ? this.dialog
          .open<RecordPaymentHost, RecordPaymentData, Payment>(RecordPaymentHost, {
            data,
            ariaLabelledBy: DIALOG_TITLE_ID,
            autoFocus: ledger ? '#rp-amount' : '#rp-ledger-q',
            maxWidth: 'calc(100vw - 32px)',
          })
          .afterClosed()
      : this.sheet
          .open<RecordPaymentHost, RecordPaymentData, Payment>(RecordPaymentHost, { data, ariaLabel: 'Record payment' })
          .afterDismissed();
    return closed.pipe(
      map((payment) => {
        if (payment) {
          this.snack
            .open('Payment recorded.', 'Print receipt', { duration: 8000 })
            .onAction()
            .subscribe(() => void this.router.navigate(['/accounts/payments', payment.id, 'receipt']));
        }
        return payment;
      }),
    );
  }
}
