import { BudgetState, ExpenseCategory, ProjectStatus } from '../../projects/data/project.models';
import { Period } from '../dashboard.models';

/** GET /api/v1/dashboard/pm. Money is a decimal string; a PM never receives finance or lead fields. */
export interface PmKpis {
  projects_running: number;
  projects_completed: number;
  total_sanctioned: string;
  total_spent: string;
  total_remaining: string;
  expenses_logged_period: number;
  expenses_amount_period: string;
}

export interface PmProject {
  id: number;
  name: string;
  client_name: string;
  status: ProjectStatus;
  sanctioned_budget: string;
  spent: string;
  remaining: string;
  usage_pct: string;
  state: BudgetState;
  expected_end_date: string | null;
}

export interface PmAlert {
  project_id: number;
  project_name: string;
  state: Exclude<BudgetState, 'ok'>;
  usage_pct: string;
  remaining: string;
}

export interface PmExpense {
  id: number;
  project_id: number;
  project_name: string;
  category: ExpenseCategory;
  amount: string;
  spent_on: string;
  has_receipt: boolean;
  is_void: boolean;
}

export type PmActivityType =
  | 'project_assigned'
  | 'budget_changed'
  | 'expense_added'
  | 'project_completed'
  | 'project_reopened';

export interface PmActivity {
  at: string;
  type: PmActivityType;
  project_id: number;
  project_name: string;
  text: string;
}

export interface PmDashboard {
  as_of: string;
  business_date: string;
  period: { key: Period; from: string | null; to: string };
  kpis: PmKpis;
  projects: PmProject[];
  alerts: PmAlert[];
  recent_expenses: PmExpense[];
  recent_activity: PmActivity[];
}
