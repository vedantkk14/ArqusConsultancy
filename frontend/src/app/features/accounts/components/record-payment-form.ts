import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { ApiError } from '../../../core/models';
import { InrPipe, formatInr } from '../../../shared/money/inr.pipe';
import { LedgerOption, PAYMENT_MODES, Payment, PaymentMode } from '../data/account.models';
import { AccountsApi } from '../data/accounts-api.service';
import { businessDate } from '../ui/business-time';
import { MoneyInput, isPositiveMoney } from '../ui/money-input';
import { fieldError } from '../ui/open';

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const BACKDATE_DAYS = 90;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ALLOWED_EXT = /\.(jpe?g|png|webp|pdf)$/i;

type FieldKey = 'ledger' | 'amount' | 'mode' | 'reference' | 'received_on' | 'note' | 'proof';
const FIELD_IDS: Record<FieldKey, string> = {
  ledger: 'rp-ledger-q',
  amount: 'rp-amount',
  mode: 'rp-mode-BANK_TRANSFER',
  reference: 'rp-reference',
  received_on: 'rp-date',
  note: 'rp-note',
  proof: 'rp-proof',
};
const ORDER: FieldKey[] = ['ledger', 'amount', 'mode', 'reference', 'received_on', 'note', 'proof'];

const REFERENCE_LABELS: Record<PaymentMode, string> = {
  CASH: 'Reference',
  BANK_TRANSFER: 'Bank reference (UTR)',
  UPI: 'UPI transaction ID',
  CHEQUE: 'Cheque number',
  CARD: 'Card approval code',
  OTHER: 'Reference',
};

/** Client-side proof check (the server validates the real file type by its bytes). */
export function proofProblem(file: { name: string; type: string; size: number }): string {
  if (!(ALLOWED.includes(file.type) || (!file.type && ALLOWED_EXT.test(file.name)))) {
    return 'Upload a JPG, PNG, WebP or PDF proof.';
  }
  return file.size > MAX_PROOF_BYTES ? 'The proof is larger than 5 MB.' : '';
}

/**
 * Record a payment. A dialog on desktop and a bottom sheet on phones, opened from the ledger list, the ledger
 * page and the payment entries page. The server has the last word (overpayment, not finalized, duplicate).
 */
@Component({
  selector: 'app-record-payment-form',
  imports: [FormsModule, InrPipe, MatButtonModule, MatIconModule, MoneyInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.in-sheet]': 'inSheet()' },
  styleUrl: '../ui/dialog.scss',
  templateUrl: './record-payment-form.html',
  styles: `
    .modes { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; border: 0; }
    .mode { position: relative; }
    .mode input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
    .mode span {
      display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; border: 1px solid var(--line);
      border-radius: var(--radius-pill); background: var(--surface); color: var(--ink-2); font-size: var(--text-sm);
      transition: background-color var(--dur-fast), border-color var(--dur-fast);
    }
    .mode:hover span { border-color: var(--line-strong); }
    .mode input:checked + span { border-color: var(--ink); background: var(--ink); color: var(--on-ink); font-weight: 600; }
    .mode input:focus-visible + span { outline: 2px solid var(--brand-deep); outline-offset: 2px; box-shadow: var(--ring); }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
    .out { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; color: var(--ink-3); font-size: var(--text-sm); }
    .out strong { color: var(--ink); }
    .fill { min-height: 32px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: var(--surface); color: var(--brand-deep); font: inherit; font-size: var(--text-sm); font-weight: 500; cursor: pointer; }
    .fill:hover { background: var(--subtle); }
    .picked-client { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--subtle); }
    .picked-client strong { color: var(--ink); }
    .opts { display: flex; flex-direction: column; margin: 4px 0 0; padding: 4px; border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface); list-style: none; }
    .opts button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; padding: 0 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
    .opts button:hover, .opts button:focus-visible { background: var(--subtle); }
    .opts .ph { color: var(--ink-3); font-size: var(--text-xs); }
    .count { align-self: flex-end; color: var(--ink-3); font-size: var(--text-xs); }
    .pick { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .pick button, .rm {
      display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border: 1px solid var(--line-strong);
      border-radius: var(--radius-control); background: var(--surface); color: var(--ink); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    .pick button:hover, .rm:hover { background: var(--subtle); }
    .picked { display: flex; align-items: center; gap: var(--space-3); padding: 8px; border: 1px solid var(--line); border-radius: var(--radius-control); }
    .picked img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; }
    .picked .pdf { display: grid; width: 56px; height: 56px; place-items: center; border-radius: 8px; background: var(--tint-rose); color: var(--tint-rose-ink); }
    .picked .nm { flex: 1; min-width: 0; color: var(--ink-2); font-size: var(--text-sm); overflow-wrap: anywhere; }
    .rm { min-height: 40px; }
    .dup { margin-bottom: var(--space-4); padding: 12px; border-radius: var(--radius-control); background: var(--tint-amber); color: var(--tint-amber-ink); font-size: var(--text-sm); }
    .dup p { margin: 0 0 8px; }
    .prog { height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--plate); }
    .prog span { display: block; height: 100%; background: var(--data-cyan); transform-origin: left; transition: transform var(--dur-base); }
    @media (max-width: 480px) { .row2 { grid-template-columns: 1fr; } }
  `,
})
export class RecordPaymentForm implements OnInit {
  /** Prefilled ledger (from a ledger page or `?ledger=`). Without one the admin searches for a client. */
  readonly ledger = input<LedgerOption | null>(null);
  /** The ledger is fixed (opened from its own page): no client search. */
  readonly locked = input(false);
  readonly inSheet = input(false);
  readonly saved = output<Payment>();
  readonly cancelled = output<void>();

  private readonly api = inject(AccountsApi);

  protected readonly modes = PAYMENT_MODES;
  protected readonly today = businessDate(0);
  protected readonly earliest = businessDate(BACKDATE_DAYS);

  protected readonly picked = signal<LedgerOption | null>(null);
  protected readonly search = signal('');
  protected readonly options = signal<LedgerOption[]>([]);
  protected amount = '';
  protected readonly mode = signal<PaymentMode>('BANK_TRANSFER');
  protected reference = '';
  protected receivedOn = this.today;
  protected note = '';

  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly errors = signal<Partial<Record<FieldKey, string>>>({});
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly progress = signal<number | null>(null);
  /** Set when the server says this payment would pass the outstanding balance. */
  protected readonly overOutstanding = signal<string | null>(null);
  protected readonly duplicate = signal(false);
  protected readonly needsReference = computed(() => this.mode() !== 'CASH');
  protected readonly referenceLabel = computed(() => REFERENCE_LABELS[this.mode()]);
  protected readonly overMessage = computed(() => {
    const left = this.overOutstanding();
    return left === null ? '' : `This is more than the outstanding balance of ${formatInr(left)}.`;
  });

  private readonly typed = new Subject<string>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearPreview());
    this.typed
      .pipe(debounceTime(250), distinctUntilChanged(), switchMap((q) => this.api.options(q)), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe({ next: (list) => this.options.set(list), error: () => this.options.set([]) });
  }

  ngOnInit(): void {
    const preset = this.ledger();
    if (preset) {
      this.picked.set(preset);
    } else {
      this.typed.next('');
    }
  }

  // ---- Client ----------------------------------------------------------------------------------

  protected onSearch(value: string): void {
    this.search.set(value);
    this.typed.next(value.trim());
  }

  protected pick(option: LedgerOption): void {
    this.picked.set(option);
    this.setError('ledger', '');
    this.overOutstanding.set(null);
  }

  protected change(): void {
    this.picked.set(null);
    this.typed.next(this.search().trim());
  }

  protected fillBalance(): void {
    const out = this.picked()?.outstanding;
    if (out) {
      this.amount = out;
      this.overOutstanding.set(null);
    }
  }

  protected setMode(mode: PaymentMode): void {
    this.mode.set(mode);
    if (mode === 'CASH') {
      this.setError('reference', '');
    }
  }

  // ---- Proof -----------------------------------------------------------------------------------

  protected onFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // picking the same file again must still fire
    if (!file) {
      return;
    }
    const problem = proofProblem(file);
    this.setError('proof', problem);
    if (problem) {
      return;
    }
    this.clearPreview();
    this.file.set(file);
    this.preview.set(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  }

  protected removeFile(): void {
    this.clearPreview();
    this.file.set(null);
    this.setError('proof', '');
  }

  private clearPreview(): void {
    const url = this.preview();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.preview.set(null);
  }

  private setError(key: FieldKey, message: string): void {
    this.errors.update((errors) => ({ ...errors, [key]: message }));
  }

  // ---- Submit ----------------------------------------------------------------------------------

  protected submit(confirmDuplicate = false): void {
    if (this.saving()) {
      return; // ignore double taps
    }
    const errors = this.validate();
    this.errors.set(errors);
    if (this.focusFirst(errors)) {
      return;
    }
    this.saving.set(true);
    this.progress.set(0);
    this.error.set('');
    this.overOutstanding.set(null);
    this.duplicate.set(false);
    this.api
      .addPayment(this.picked()!.id, {
        amount: this.amount,
        mode: this.mode(),
        reference: this.needsReference() ? this.reference.trim() : '',
        received_on: this.receivedOn,
        note: this.note.trim(),
        proof: this.file(),
        ...(confirmDuplicate ? { confirm_duplicate: true } : {}),
      })
      .subscribe({
        next: (event) => {
          if (event.kind === 'progress') {
            this.progress.set(event.percent);
          } else {
            this.saving.set(false);
            this.saved.emit(event.payment);
          }
        },
        error: (err: ApiError) => {
          this.saving.set(false);
          this.progress.set(null);
          this.fail(err);
        },
      });
  }

  private validate(): Partial<Record<FieldKey, string>> {
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!this.picked()) {
      errors.ledger = 'Choose the client.';
    }
    if (!isPositiveMoney(this.amount)) {
      errors.amount = 'Enter the amount.';
    }
    if (this.needsReference() && !this.reference.trim()) {
      errors.reference = `Enter the ${this.referenceLabel().toLowerCase()}.`;
    }
    if (!this.receivedOn) {
      errors.received_on = 'Choose the date.';
    } else if (this.receivedOn > this.today) {
      errors.received_on = 'The date cannot be in the future.';
    } else if (this.receivedOn < this.earliest) {
      errors.received_on = `The date cannot be more than ${BACKDATE_DAYS} days ago.`;
    }
    if (this.errors().proof) {
      errors.proof = this.errors().proof;
    }
    return errors;
  }

  private fail(err: ApiError): void {
    if (err.code === 'overpayment') {
      this.overOutstanding.set(String(err.details['outstanding'] ?? '0.00'));
      return;
    }
    if (err.code === 'duplicate_payment') {
      this.duplicate.set(true);
      return;
    }
    const mapped: Partial<Record<FieldKey, string>> = {};
    for (const key of ORDER) {
      const message = fieldError(err, key);
      if (message) {
        mapped[key] = message;
      }
    }
    if (err.code === 'invalid_proof') {
      mapped.proof = err.message;
    }
    if (Object.keys(mapped).length) {
      this.errors.set(mapped);
      this.focusFirst(mapped);
    } else {
      this.error.set(
        err.code === 'not_finalized' ? 'Finalize the deal amount before recording payments.' : err.message,
      );
    }
  }

  /** Focus the first invalid field (in form order); true when there was one. */
  private focusFirst(errors: Partial<Record<FieldKey, string>>): boolean {
    const first = ORDER.find((key) => errors[key]);
    if (!first) {
      return false;
    }
    const id = first === 'mode' ? `rp-mode-${this.mode()}` : first === 'ledger' && this.picked() ? 'rp-amount' : FIELD_IDS[first];
    document.getElementById(id)?.focus();
    return true;
  }
}
