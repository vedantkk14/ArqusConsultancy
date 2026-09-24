/** Shapes of /api/v1/ledgers and /api/v1/payments (see docs/API_CONTRACT.md). Money is a decimal string. */

export type LedgerState = 'AWAITING_FINALIZATION' | 'UNPAID' | 'PARTIAL' | 'PAID';
export type PaymentMode = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'CARD' | 'OTHER';
export type LedgerMode = 'all' | 'pending';
export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

export const STATE_LABELS: Record<LedgerState, string> = {
  AWAITING_FINALIZATION: 'Awaiting finalization',
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
};

/** Token tint per state; the words are always written next to it. */
export const STATE_TINT: Record<LedgerState, string> = {
  AWAITING_FINALIZATION: 'amber',
  UNPAID: 'rose',
  PARTIAL: 'cyan',
  PAID: 'teal',
};

export const PAYMENT_MODES: readonly [PaymentMode, string][] = [
  ['CASH', 'Cash'],
  ['BANK_TRANSFER', 'Bank transfer'],
  ['UPI', 'UPI'],
  ['CHEQUE', 'Cheque'],
  ['CARD', 'Card'],
  ['OTHER', 'Other'],
];

export const AGING_BUCKETS: readonly AgingBucket[] = ['0-30', '31-60', '61-90', '90+'];

export interface LedgerRow {
  id: number;
  lead: number;
  client: string;
  phone: string;
  exec_name: string | null;
  state: LedgerState;
  state_label: string;
  finalized: boolean;
  is_overdue: boolean;
  total: string;
  received: string;
  outstanding: string;
  collected_pct: string;
  days_since: number | null;
  last_payment_on: string | null;
  created_at: string;
}

export interface ProjectBlock {
  id: number;
  name: string;
  status: 'RUNNING' | 'COMPLETED';
  sanctioned_budget: string;
  spent: string;
  planned_margin: string | null;
  live_margin: string | null;
}

export type LedgerAction = 'finalize' | 'record_payment' | 'reminder' | 'revise_total' | 'statement';

export interface LedgerDetail extends LedgerRow {
  lead_block: { id: number; name: string; phone: string; email: string; exec_name: string | null; status: string };
  project: ProjectBlock | null;
  finalized_at: string | null;
  finalized_by: { id: number; name: string } | null;
  finalize_note: string;
  proposed_amount: string | null;
  allowed_actions: LedgerAction[];
}

export interface LedgerSummary {
  total_value: string;
  received: string;
  outstanding: string;
  overdue_amount: string;
  clients_with_balance: number;
  overdue_clients: number;
  collection_rate_pct: string;
  awaiting_finalization: number;
  counts: Record<LedgerState, number>;
  aging: { bucket: AgingBucket; count: number; amount: string }[];
  top_overdue: { ledger: number; client: string; outstanding: string; days_since: number }[];
}

export interface LedgerOption {
  id: number;
  client: string;
  phone: string;
  total: string;
  outstanding: string;
}

export interface LedgerFilters {
  q: string;
  state: string;
  overdue: string;
  aging: string;
  created_from: string;
  created_to: string;
  ordering: string;
}

export const EMPTY_FILTERS: LedgerFilters = {
  q: '',
  state: '',
  overdue: '',
  aging: '',
  created_from: '',
  created_to: '',
  ordering: '',
};

export const LEDGER_ORDERINGS = [
  { value: '-outstanding', label: 'Highest balance' },
  { value: '-days_since', label: 'Waiting longest' },
  { value: '-created_at', label: 'Newest' },
  { value: 'client', label: 'Client A to Z' },
  { value: '-total', label: 'Highest total' },
  { value: '-last_payment_on', label: 'Last paid' },
] as const;

export interface Payment {
  id: number;
  ledger: number;
  client: string;
  receipt_no: string;
  amount: string;
  mode: PaymentMode;
  mode_label: string;
  reference: string;
  received_on: string;
  note: string;
  has_proof: boolean;
  proof_kind: 'image' | 'pdf' | '';
  proof_type: string;
  is_void: boolean;
  void_reason: string;
  recorded_by: { id: number; name: string } | null;
  created_at: string;
  /** Only on a single payment (POST result, GET /payments/{id}). */
  balance_after?: string | null;
  amount_in_words?: string;
  client_phone?: string;
  company?: string;
}

export interface PaymentInput {
  amount: string;
  mode: PaymentMode;
  reference: string;
  received_on: string;
  note: string;
  confirm_duplicate?: boolean;
  proof?: File | null;
}

export interface PaymentFilters {
  q: string;
  ledger: string;
  mode: string;
  date_from: string;
  date_to: string;
  has_proof: string;
  state: string;
  ordering: string;
}

export const EMPTY_PAYMENT_FILTERS: PaymentFilters = {
  q: '',
  ledger: '',
  mode: '',
  date_from: '',
  date_to: '',
  has_proof: '',
  state: '',
  ordering: '',
};

export interface PaymentSummary {
  total: string;
  count: number;
  void_count: number;
  by_mode: { mode: PaymentMode; label: string; total: string; count: number }[];
}

export type LedgerEventType =
  | 'CREATED'
  | 'FINALIZED'
  | 'TOTAL_REVISED'
  | 'PAYMENT_ADDED'
  | 'PAYMENT_VOIDED'
  | 'REMINDER_SENT';

export interface LedgerEvent {
  id: number;
  type: LedgerEventType;
  actor_name: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface Statement {
  client: { name: string; phone: string; email: string };
  ledger: number;
  finalized: boolean;
  period: { from: string | null; to: string | null };
  total_amount: string;
  opening_balance: string;
  rows: { date: string; receipt_no: string; particulars: string; credit: string; balance: string }[];
  credit_total: string;
  closing_balance: string;
  generated_on: string;
}

export interface Reminder {
  text: string;
  url: string;
}
