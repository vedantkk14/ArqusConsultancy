import { Observable, Subject, of } from 'rxjs';
import { QueryParams } from '../../../core/api/api.service';
import { PaginatedResponse } from '../../../core/models';
import {
  LedgerDetail,
  LedgerEvent,
  LedgerOption,
  LedgerRow,
  LedgerSummary,
  Payment,
  PaymentSummary,
  Statement,
} from '../data/account.models';
import { UploadEvent } from '../data/accounts-api.service';

export function page<T>(results: T[], count = results.length): PaginatedResponse<T> {
  return { count, next: null, previous: null, results };
}

export function makeRow(id: number, patch: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id,
    lead: id + 100,
    client: `Client ${id}`,
    phone: `+9198000000${String(id).padStart(2, '0')}`,
    exec_name: 'Eva Exec',
    state: 'PARTIAL',
    state_label: 'Partial',
    finalized: true,
    is_overdue: false,
    total: '100000.00',
    received: '40000.00',
    outstanding: '60000.00',
    collected_pct: '40.0',
    days_since: 5,
    last_payment_on: '2026-09-20',
    created_at: '2026-08-01T06:30:00Z',
    ...patch,
  };
}

export function makeLedger(id: number, patch: Partial<LedgerDetail> = {}): LedgerDetail {
  return {
    ...makeRow(id),
    lead_block: { id: id + 100, name: `Client ${id}`, phone: '+919800000001', email: 'c@x.com', exec_name: 'Eva Exec', status: 'WON' },
    project: null,
    finalized_at: '2026-08-02T06:30:00Z',
    finalized_by: { id: 1, name: 'Alice Admin' },
    finalize_note: '',
    proposed_amount: '100000.00',
    allowed_actions: ['record_payment', 'reminder', 'revise_total', 'statement'],
    ...patch,
  };
}

export function makePayment(id: number, patch: Partial<Payment> = {}): Payment {
  return {
    id,
    ledger: 1,
    client: 'Client 1',
    receipt_no: `RC-2026-${String(id).padStart(6, '0')}`,
    amount: '20000.00',
    mode: 'BANK_TRANSFER',
    mode_label: 'Bank transfer',
    reference: 'UTR123',
    received_on: '2026-09-20',
    note: '',
    has_proof: true,
    proof_kind: 'image',
    proof_type: 'image/png',
    is_void: false,
    void_reason: '',
    recorded_by: { id: 1, name: 'Alice Admin' },
    created_at: '2026-09-20T06:30:00Z',
    ...patch,
  };
}

export const SUMMARY: LedgerSummary = {
  total_value: '3000000.00',
  received: '1200000.00',
  outstanding: '1800000.00',
  overdue_amount: '900000.00',
  clients_with_balance: 5,
  overdue_clients: 2,
  collection_rate_pct: '40.0',
  awaiting_finalization: 1,
  counts: { AWAITING_FINALIZATION: 1, UNPAID: 2, PARTIAL: 3, PAID: 2 },
  aging: [
    { bucket: '0-30', count: 2, amount: '300000.00' },
    { bucket: '31-60', count: 1, amount: '200000.00' },
    { bucket: '61-90', count: 1, amount: '400000.00' },
    { bucket: '90+', count: 1, amount: '900000.00' },
  ],
  top_overdue: [],
};

export const OPTION: LedgerOption = { id: 1, client: 'Client 1', phone: '+919800000001', total: '100000.00', outstanding: '60000.00' };

/** Records calls; each ledgers() returns a Subject the test resolves (or fails). */
export class FakeAccountsApi {
  ledgerCalls: QueryParams[] = [];
  pending = new Subject<PaginatedResponse<LedgerRow>>();
  summary$: Observable<LedgerSummary> = of(SUMMARY);
  detail: LedgerDetail = makeLedger(1);
  paymentRows: Payment[] = [makePayment(1)];
  paymentCalls: QueryParams[] = [];
  events$: LedgerEvent[] = [];
  optionRows: LedgerOption[] = [OPTION];
  actions: { name: string; args: unknown[] }[] = [];
  uploadResult: Observable<UploadEvent> = of({ kind: 'done', payment: makePayment(9) });
  statementResult: Statement = {
    client: { name: 'Client 1', phone: '+919800000001', email: '' },
    ledger: 1,
    finalized: true,
    period: { from: null, to: null },
    total_amount: '100000.00',
    opening_balance: '100000.00',
    rows: [{ date: '2026-09-20', receipt_no: 'RC-2026-000001', particulars: 'Bank transfer UTR1', credit: '40000.00', balance: '60000.00' }],
    credit_total: '40000.00',
    closing_balance: '60000.00',
    generated_on: '2026-09-25',
  };
  paymentSummary$: Observable<PaymentSummary> = of({ total: '40000.00', count: 1, void_count: 0, by_mode: [] });
  finalizeResult: Observable<LedgerDetail> = of(makeLedger(1));

  ledgers(params: QueryParams) {
    this.ledgerCalls.push(params);
    this.pending = new Subject();
    return this.pending;
  }
  summary() {
    return this.summary$;
  }
  options() {
    return of(this.optionRows);
  }
  ledger() {
    return of(this.detail);
  }
  ledgerShared() {
    return of(this.detail);
  }
  finalize(...args: unknown[]) {
    this.actions.push({ name: 'finalize', args });
    return this.finalizeResult;
  }
  reviseTotal(...args: unknown[]) {
    this.actions.push({ name: 'reviseTotal', args });
    return of(this.detail);
  }
  reminder(...args: unknown[]) {
    this.actions.push({ name: 'reminder', args });
    return of({ text: 'Hello', url: 'https://wa.me/919800000001?text=Hello' });
  }
  events() {
    return of(page(this.events$));
  }
  ledgerPayments() {
    return of(page(this.paymentRows));
  }
  payments(params: QueryParams = {}) {
    this.paymentCalls.push(params);
    return of(page(this.paymentRows));
  }
  paymentSummary() {
    return this.paymentSummary$;
  }
  payment() {
    return of({ ...this.paymentRows[0], balance_after: '60000.00', amount_in_words: 'Rupees Twenty Thousand Only' });
  }
  statement(...args: unknown[]) {
    this.actions.push({ name: 'statement', args });
    return of(this.statementResult);
  }
  statementCsv() {
    return of(new Blob());
  }
  addPayment(...args: unknown[]) {
    this.actions.push({ name: 'addPayment', args });
    return this.uploadResult;
  }
  voidPayment(...args: unknown[]) {
    this.actions.push({ name: 'voidPayment', args });
    return of(makePayment(1, { is_void: true }));
  }
  proof() {
    return of(new Blob(['x'], { type: 'image/png' }));
  }
  exportLedgers() {
    return of(new Blob());
  }
  exportPayments() {
    return of(new Blob());
  }
}
