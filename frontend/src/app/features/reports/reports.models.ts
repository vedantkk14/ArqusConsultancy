export const REPORT_PERIODS = ['month', 'quarter', 'year', 'all', 'custom'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  all: 'All',
  custom: 'Custom',
};

export function toReportPeriod(value: string | null | undefined): ReportPeriod {
  return (REPORT_PERIODS as readonly string[]).includes(value ?? '') ? (value as ReportPeriod) : 'month';
}

interface Base {
  period: ReportPeriod;
  range: { start: string | null; end: string };
  data_sources: Record<string, boolean>;
}

export interface SalesRow {
  user_id: number;
  name: string;
  leads_worked: number;
  won: number;
  lost: number;
  conversion_pct: string;
  won_value: string;
  commission_rate: string;
  commission: string;
}

export interface SalesReport extends Base {
  rows: SalesRow[];
  totals: { leads_worked: number; won: number; lost: number; conversion_pct: string; won_value: string; commission: string };
}

export interface AgingBucket {
  bucket: string;
  count: number;
  amount: string;
}

export interface FinancialReport extends Base {
  note: string | null;
  months: string[];
  received: string[];
  spent: string[];
  totals: { received: string; spent: string; net: string; outstanding: string; collection_rate_pct: string };
  aging: AgingBucket[];
  top_outstanding_clients: { name: string; ledgers: number; outstanding: string }[];
}

export interface MarginRow {
  id: number;
  name: string;
  pm: string;
  sanctioned: string;
  spent: string;
  usage_pct: string;
  total: string | null;
  received: string | null;
  planned_margin: string | null;
  live_margin: string | null;
}

export interface MarginReport extends Base {
  note: string | null;
  rows: MarginRow[];
}

export interface FunnelReportStage {
  status: string;
  label: string;
  count: number;
  value: string;
  reached: number;
  conversion_pct: string | null;
}

export interface FunnelReport extends Base {
  stages: FunnelReportStage[];
  lost: { count: number; value: string };
  sources: { source: string; label: string; leads: number; won: number; conversion_pct: string; value: string }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09" -> "Sep 26". */
export function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}
