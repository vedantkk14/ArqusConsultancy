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

export type ProjectAction = 'add_expense' | 'complete' | 'reassign' | 'edit' | 'reopen';

/**
 * What a project manager may see: the project and the expenses logged so far. Never gains a
 * budget, finance or lead field. The budget fields are Admin only (the deal total).
 */
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
  /** This client's Nth deal, only when they have more than one project (>= 2). Else absent. */
  deal_no?: number | null;
  /** Admin only. */
  pm?: Person | null;
  /** Expenses so far (non-void). */
  /** Admin and PM only (a Sales Manager never gets it). */
  spent?: string;
  /** Admin and Sales Manager: the client's lead, for the link to their profile. */
  lead_id?: number | null;
  /** Admin only: the finalized deal total. Null until the deal is finalized. */
  total_budget?: string | null;
  /** Admin only: total budget minus expenses so far (negative when overspent). */
  remaining?: string | null;
  /** Admin only. */
  usage_pct?: string;
  /** Admin only. */
  state?: BudgetState;
}

/** Admin only: ledger figures from accounts. Null until accounts can answer. */
export interface Finance {
  /** Admin only: lets the Finance panel offer Revise total. */
  ledger_id?: number | null;
  total_amount: string;
  received: string | null;
  outstanding: string | null;
  finalized: boolean;
  live_margin: string | null;
}

export interface ProjectDetail extends ProjectListItem {
  scope: string;
  allowed_actions: ProjectAction[];
  /** Admin only: the won deal this project delivers. */
  opportunity_id?: number | null;
  finance?: Finance | null;
}

export interface ProjectSummary {
  running: number;
  completed: number;
  /** Admin and PM only. */
  spent_total?: string;
  /** Admin only: budget states against the deal total. */
  ok?: number;
  warn?: number;
  over?: number;
  no_pm?: number;
  budget_total?: string;
}

/** A won deal (opportunity) that can become a project, with its client's name. */
export interface ConvertibleLead {
  opportunity: number;
  /** "Deal #2" for repeat business with the same client. */
  sequence_no: number;
  lead: number;
  name: string;
  exec_name: string | null;
  won_at: string | null;
  proposed_amount: string | null;
  total_amount: string | null;
  ineligible_reason: 'not_won' | 'project_exists' | 'not_finalized' | null;
  project_id: number | null;
}

export interface ConvertInput {
  opportunity: number;
  name: string;
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
  /** Admin only: '', 'ok', 'warn', 'over' (expenses against the deal total). */
  state: string;
  /** Admin dashboard links: 'true' means warn + over / warn only / no manager. */
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
  { value: '-spent', label: 'Highest spend' },
  { value: 'expected_end_date', label: 'Due soonest' },
  { value: '-created_at', label: 'Newest' },
  { value: 'name', label: 'Name A to Z' },
] as const;

/** Admin only: ordering by budget used against the deal total. */
export const ADMIN_ORDERINGS = [
  { value: '-usage_pct', label: 'Most budget used' },
  ...ORDERINGS,
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
  receipt?: File | null;
}

export type EventType =
  | 'CREATED'
  | 'PM_ASSIGNED'
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

/** Money helpers: string-only, never floats. */
export const isRunning = (p: { status: ProjectStatus }): boolean => p.status === 'RUNNING';
