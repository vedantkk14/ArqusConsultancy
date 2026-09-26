import { ExpenseCategory, ProjectStatus } from '../../projects/data/project.models';
import { Period } from '../dashboard.models';

/**
 * GET /api/v1/dashboard/pm. Money is a decimal string. A PM never receives any budget, finance or lead
 * field: they see their projects and the expenses logged on them.
 */
export interface PmKpis {
  projects_running: number;
  projects_completed: number;
  total_spent: string;
  expenses_logged_period: number;
  expenses_amount_period: string;
}

export interface PmProject {
  id: number;
  name: string;
  client_name: string;
  status: ProjectStatus;
  /** Expenses so far. */
  spent: string;
  expected_end_date: string | null;
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
  'project_assigned' | 'expense_added' | 'project_completed' | 'project_reopened';

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
  recent_expenses: PmExpense[];
  recent_activity: PmActivity[];
}
