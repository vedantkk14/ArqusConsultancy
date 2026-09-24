/** GET /api/v1/dashboard/sales-manager. Money is always a decimal string ("1234.50"). */

import { LeadStatus } from '../../leads/data/lead.models';
import { Period } from '../dashboard.models';

export type { Period };
export { PERIODS, PERIOD_LABELS, DEFAULT_PERIOD, toPeriod } from '../dashboard.models';

/** Manager sees the exec's own proposed value only - never a ledger, payment, project or final amount. */
export interface QueueLeadItem {
  id: number;
  name: string;
  phone: string;
  status: LeadStatus;
  source_label: string;
  next_followup_at: string | null;
  days_overdue: number;
  proposed_amount: string | null;
  last_note: string;
  /** Absent on the `unassigned` queue's items (there is nothing to show). */
  assigned_to?: { id: number; name: string } | null;
}

export interface Queue {
  total: number;
  items: QueueLeadItem[];
}

export interface SalesManagerKpis {
  team_open_leads: number;
  team_new_untouched: number;
  team_followups_today: number;
  team_overdue: number;
  team_won_count: number;
  team_lost_count: number;
  team_conversion_pct: string;
  team_won_value: string;
  unassigned_leads: number;
}

export interface ExecRow {
  id: number;
  name: string;
  open_leads: number;
  overdue: number;
  won_count: number;
  won_value: string;
  conversion_pct: string;
  load_score: number;
}

export interface PipelineStage {
  status: LeadStatus;
  count: number;
}

export interface TeamActivity {
  at: string;
  exec_name: string;
  lead_id: number;
  lead_name: string;
  type: string;
  text: string;
}

export interface SalesManagerDashboard {
  as_of: string;
  business_date: string;
  period: { key: Period; from: string | null; to: string };
  kpis: SalesManagerKpis;
  queues: { overdue: Queue; today: Queue; unassigned: Queue; won_awaiting: Queue };
  by_executive: ExecRow[];
  pipeline: PipelineStage[];
  recent_activity: TeamActivity[];
}

/** A manager's team is highlighted, not judged, past this many overdue leads. */
export const OVERDUE_HIGHLIGHT_THRESHOLD = 3;
