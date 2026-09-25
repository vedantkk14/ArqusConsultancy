/** Shapes of /api/v1/projects and /api/v1/expenses (see docs/API_CONTRACT.md). Money is a decimal string. */

export type ProjectStatus = 'RUNNING' | 'COMPLETED';
export type BudgetState = 'ok' | 'warn' | 'over';
export type ProjectMode = 'running' | 'completed';

export const STATE_LABELS: Record<BudgetState, string> = {
  ok: 'On track',
  warn: 'Near limit',
  over: 'Over budget',
};

/** Token tint per budget state; the label is always written next to it. */
export const STATE_TINT: Record<BudgetState, string> = { ok: 'cyan', warn: 'amber', over: 'rose' };

export interface Person {
  id: number;
  name: string;
}

export type ProjectAction =
  | 'add_expense'
  | 'complete'
  | 'adjust_budget'
  | 'reassign'
  | 'edit'
  | 'reopen'
  | 'request_budget'
  | 'decide_budget_request'
  | 'release_budget';

/** A PM's request for more budget, waiting for the Admin. */
export interface PendingBudgetRequest {
  id: number;
  amount: string;
  reason: string;
  requested_by: string | null;
  created_at: string;
}

/** What a project manager may see. Never gains a finance or lead field. */
export interface ProjectListItem {
  id: number;
  name: string;
  client_name: string;
  status: ProjectStatus;
  start_date: string | null;
  expected_end_date: string | null;
  completed_at: string | null;
  created_at: string;
  pm_name: string | null;
  /** Admin only. */
  pm?: Person | null;
  sanctioned_budget: string;
  spent: string;
  remaining: string;
  usage_pct: string;
  state: BudgetState;
  pending_budget_request?: PendingBudgetRequest | null;
}

/** Admin only: ledger figures from accounts. Null until accounts can answer. */
export interface Finance {
  total_amount: string;
  received: string | null;
  outstanding: string | null;
  finalized: boolean;
  planned_margin: string | null;
  live_margin: string | null;
}

export interface ProjectDetail extends ProjectListItem {
  scope: string;
  allowed_actions: ProjectAction[];
  /** Admin only. */
  lead_id?: number | null;
  finance?: Finance | null;
}

export interface ProjectSummary {
  running: number;
  completed: number;
  ok: number;
  warn: number;
  over: number;
  /** Admin only. */
  no_pm?: number;
  sanctioned_total: string;
  spent_total: string;
}

export interface ConvertibleLead {
  lead: number;
  name: string;
  exec_name: string | null;
  won_at: string | null;
  proposed_amount: string | null;
  total_amount: string | null;
  suggested_budget: string | null;
  ineligible_reason: 'not_won' | 'project_exists' | 'not_finalized' | null;
  project_id: number | null;
}

export interface ConvertInput {
  lead: number;
  name: string;
  sanctioned_budget: string;
  pm: number | null;
  start_date: string | null;
  expected_end_date: string | null;
  scope: string;
}

export interface Manager extends Person {
  running_projects: number;
}

// ---- Filters (all mirrored in the URL) ---------------------------------------------------------------

export interface ProjectFilters {
  q: string;
  /** '', 'ok', 'warn', 'over' */
  state: string;
  /** Dashboard links: 'true' means warn + over / warn only / no manager. */
  over_budget: string;
  near_limit: string;
  no_pm: string;
  /** '', 'none' or a manager id */
  pm: string;
  created_from: string;
  created_to: string;
  ordering: string;
}

export const EMPTY_FILTERS: ProjectFilters = {
  q: '',
  state: '',
  over_budget: '',
  near_limit: '',
  no_pm: '',
  pm: '',
  created_from: '',
  created_to: '',
  ordering: '',
};

export const ORDERINGS = [
  { value: '-usage_pct', label: 'Most budget used' },
  { value: '-spent', label: 'Highest spend' },
  { value: 'expected_end_date', label: 'Due soonest' },
  { value: '-created_at', label: 'Newest' },
  { value: 'name', label: 'Name A to Z' },
] as const;

// ---- Expenses --------------------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  ['MATERIALS', 'Materials'],
  ['LABOUR', 'Labour'],
  ['TRANSPORT', 'Transport'],
  ['EQUIPMENT', 'Equipment'],
  ['FOOD', 'Food'],
  ['PERMITS', 'Permits'],
  ['OTHER', 'Other'],
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number][0];

export interface Expense {
  id: number;
  project: number;
  project_name: string;
  category: ExpenseCategory;
  category_label: string;
  amount: string;
  spent_on: string;
  vendor: string;
  description: string;
  has_receipt: boolean;
  receipt_kind: 'image' | 'pdf' | '';
  receipt_type: string;
  is_void: boolean;
  void_reason: string;
  is_override: boolean;
  /** Admin only. */
  override_reason?: string;
  logged_by: Person | null;
  created_at: string;
  can_edit: boolean;
}

export interface ExpenseFilters {
  q: string;
  project: string;
  category: string;
  logged_by: string;
  date_from: string;
  date_to: string;
  has_receipt: string;
  state: string;
  ordering: string;
}

export const EMPTY_EXPENSE_FILTERS: ExpenseFilters = {
  q: '',
  project: '',
  category: '',
  logged_by: '',
  date_from: '',
  date_to: '',
  has_receipt: '',
  state: '',
  ordering: '',
};

export interface ExpenseSummary {
  total: string;
  count: number;
  void_count: number;
  by_category: { category: ExpenseCategory; label: string; total: string; count: number }[];
}

export interface ExpenseInput {
  amount: string;
  category: ExpenseCategory;
  spent_on: string;
  vendor: string;
  description: string;
  admin_override?: boolean;
  override_reason?: string;
  receipt?: File | null;
}

export type EventType =
  | 'CREATED'
  | 'PM_ASSIGNED'
  | 'BUDGET_CHANGED'
  | 'EXPENSE_ADDED'
  | 'EXPENSE_EDITED'
  | 'EXPENSE_VOIDED'
  | 'COMPLETED'
  | 'REOPENED';

export interface ProjectEvent {
  id: number;
  type: EventType;
  actor_name: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface AlertProject extends ProjectListItem {
  over_by: string;
}

/** Money helpers: string-only, never floats. */
export const isRunning = (p: { status: ProjectStatus }): boolean => p.status === 'RUNNING';
