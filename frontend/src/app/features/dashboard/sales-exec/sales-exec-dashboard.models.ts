/** GET /api/v1/dashboard/sales-exec. Money is always a decimal string ("1234.50") or null. */

import { LeadSource, LeadStatus } from '../../leads/data/lead.models';
import { Period } from '../dashboard.models';

export type { Period };
export { PERIODS, PERIOD_LABELS, PERIOD_NOUN, DEFAULT_PERIOD, toPeriod } from '../dashboard.models';

/** Exec sees `proposed_amount` only - never a ledger, payment, project or final amount. */
export interface ExecLeadItem {
  id: number;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  created_at: string;
  next_followup_at: string | null;
  days_overdue: number;
  last_note: string;
  last_interaction_at: string | null;
  proposed_amount: string | null;
}

export interface ExecQueue {
  total: number;
  items: ExecLeadItem[];
}

export interface ExecKpis {
  open_leads: number;
  new_untouched: number;
  followups_today: number;
  overdue: number;
  won_count: number;
  lost_count: number;
  conversion_pct: string;
  won_value: string;
  /** Only present when the backend's SHOW_COMMISSION_TO_EXEC flag is on. */
  estimated_commission?: string;
}

export interface PipelineStage {
  status: LeadStatus;
  count: number;
}

export interface UpcomingDay {
  date: string;
  count: number;
  items: ExecLeadItem[];
}

export interface ExecActivity {
  at: string;
  lead_id: number;
  lead_name: string;
  type: string;
  text: string;
}

export interface SalesExecDashboard {
  as_of: string;
  business_date: string;
  period: { key: Period; from: string | null; to: string };
  kpis: ExecKpis;
  queues: { overdue: ExecQueue; today: ExecQueue; new_leads: ExecQueue; no_followup: ExecQueue };
  pipeline: PipelineStage[];
  upcoming: UpcomingDay[];
  recent_activity: ExecActivity[];
}
