/** GET /api/v1/dashboard/admin. Money is always a decimal string ("1234.50"). */

export const PERIODS = ['month', 'quarter', 'year', 'all'] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = 'month';

export const PERIOD_LABELS: Record<Period, string> = {
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  all: 'All',
};

/** "vs last month", used under deltas. */
export const PERIOD_COMPARISON: Record<Period, string> = {
  month: 'vs last month',
  quarter: 'vs last quarter',
  year: 'vs last year',
  all: '',
};

/** "this month", used for period figures. */
export const PERIOD_NOUN: Record<Period, string> = {
  month: 'this month',
  quarter: 'this quarter',
  year: 'this year',
  all: 'in total',
};

export function toPeriod(value: string | null | undefined): Period {
  return (PERIODS as readonly string[]).includes(value ?? '') ? (value as Period) : DEFAULT_PERIOD;
}

export interface DashboardKpis {
  received: string;
  received_prev: string;
  received_delta_pct: string | null;
  outstanding: string;
  outstanding_clients: number;
  outstanding_overdue: string;
  leads_total: number;
  leads_new: number;
  leads_new_prev: number;
  open_count: number;
  open_value: string;
  won_count: number;
  lost_count: number;
  win_rate_pct: string;
  projects_running: number;
  projects_completed: number;
}

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
  route: string;
}

export interface FunnelStage {
  status: string;
  label: string;
  count: number;
}

export interface ExecSales {
  user_id: number;
  name: string;
  won_count: number;
  won_value: string;
}

export interface RecentPayment {
  date: string;
  client: string;
  reference: string;
  amount: string;
}

export interface RecentExpense {
  date: string;
  project: string;
  category: string;
  amount: string;
}

export interface RecentActivity {
  when: string;
  actor: string;
  action: string;
}

export interface AdminDashboard {
  period: Period;
  range: { start: string | null; end: string; prev_start: string | null; prev_end: string | null };
  data_sources: Record<string, boolean>;
  kpis: DashboardKpis;
  trends: { months: string[]; leads_new: number[]; received: string[] };
  cashflow: { months: string[]; collected: string[]; spent: string[] };
  attention: AttentionItem[];
  funnel: FunnelStage[];
  sales_by_exec: ExecSales[];
  recent: { payments: RecentPayment[]; expenses: RecentExpense[]; activity: RecentActivity[] };
}
