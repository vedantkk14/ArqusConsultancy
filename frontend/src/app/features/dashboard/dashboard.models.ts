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
  spent: string;
  net: string;
  net_margin_pct: string;
  collection_rate_pct: string;
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
  value: string;
}

export interface ExecSales {
  user_id: number;
  name: string;
  won_count: number;
  won_value: string;
  share_pct: string;
  win_rate_pct: string;
}

export interface LeadSource {
  source: string;
  count: number;
  pct: string;
}

export interface AgingBucket {
  bucket: '0-30' | '31-60' | '61-90' | '90+';
  count: number;
  amount: string;
}

export interface OverdueClient {
  ledger_id: number;
  client: string;
  outstanding: string;
  days: number;
}

export interface ProjectBurn {
  id: number;
  name: string;
  sanctioned: string;
  spent: string;
  pct: string;
  state: 'ok' | 'warn' | 'over';
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
  type?: 'lead' | 'payment' | 'expense' | 'project' | 'user';
}

export interface AdminDashboard {
  period: Period;
  range: { start: string | null; end: string; prev_start: string | null; prev_end: string | null };
  data_sources: Record<string, boolean>;
  kpis: DashboardKpis;
  trends: { months: string[]; leads_new: number[]; received: string[] };
  cashflow: { months: string[]; collected: string[]; spent: string[]; net: string[] };
  attention: AttentionItem[];
  funnel: FunnelStage[];
  sales_by_exec: ExecSales[];
  lead_sources: LeadSource[];
  collections_aging: AgingBucket[];
  top_overdue_clients: OverdueClient[];
  projects_burn: ProjectBurn[];
  recent: { payments: RecentPayment[]; expenses: RecentExpense[]; activity: RecentActivity[] };
}
