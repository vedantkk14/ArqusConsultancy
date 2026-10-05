import { Role } from '../../core/models';

export interface TeamUser {
  id: number;
  username: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
  date_joined: string;
}

export interface ExecLoad {
  id: number;
  name: string;
  open_leads: number;
  overdue: number;
  won_leads: number;
}

export interface PmLoad {
  id: number;
  name: string;
  running_projects: number;
  completed_projects: number;
}

export interface AssignmentsOverview {
  data_sources: { leads: boolean; projects: boolean };
  execs: ExecLoad[];
  pms: PmLoad[];
}

export interface LeadPerformance {
  assigned: number;
  open: number;
  won: number;
  lost: number;
  conversion_pct: string;
  won_value: string;
  open_value: string;
  overdue_followups: number;
  won_this_month: number;
  leads_created: number;
  lost_reasons: { reason: string; count: number }[];
  recent_closed: {
    id: number;
    name: string;
    status: 'WON' | 'LOST';
    value: string | null;
    when: string;
  }[];
}

export type Delivery = 'on_time' | 'late' | 'overdue' | 'in_progress' | 'no_deadline';

export interface ProjectPerformance {
  managed: number;
  running: number;
  completed: number;
  completed_on_time: number;
  completed_late: number;
  completed_no_deadline: number;
  on_time_pct: string;
  running_overdue: number;
  /** Projects whose expenses passed the deal total (admin view). */
  over_budget: number;
  /** Sum of the deal totals (finalized ledgers) of these projects. */
  total_budget: string;
  spent: string;
  projects: {
    id: number;
    name: string;
    status: 'RUNNING' | 'COMPLETED';
    expected_end_date: string | null;
    completed_on: string | null;
    delivery: Delivery;
    /** The finalized deal total, or null before finalization. */
    total_budget: string | null;
    spent: string;
    usage_pct: string;
    budget_state: 'ok' | 'warn' | 'over';
  }[];
}

export interface MemberPerformance {
  user: {
    id: number;
    name: string;
    username: string;
    email: string;
    phone: string;
    role: Role;
    is_active: boolean;
    date_joined: string;
    last_login: string | null;
  };
  leads: LeadPerformance | null;
  projects: ProjectPerformance | null;
}

export const DELIVERY_LABELS: Record<Delivery, string> = {
  on_time: 'Delivered on time',
  late: 'Delivered late',
  overdue: 'Past deadline',
  in_progress: 'In progress',
  no_deadline: 'No deadline set',
};

export interface UserEdit {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: Role;
}
