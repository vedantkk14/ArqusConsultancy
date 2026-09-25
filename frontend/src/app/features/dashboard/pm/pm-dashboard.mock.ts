import { PmDashboard } from './pm-dashboard.models';

const NOW = Date.now();
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const day = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString().slice(0, 10);

/** Review fixture for `environment.useMocks`. Numbers are internally consistent. */
export function mockPmDashboard(): PmDashboard {
  return {
    as_of: iso(0),
    business_date: day(0),
    period: { key: 'month', from: day(20), to: day(0) },
    kpis: {
      projects_running: 2,
      projects_completed: 1,
      total_sanctioned: '900000.00',
      total_spent: '627500.00',
      total_remaining: '272500.00',
      expenses_logged_period: 4,
      expenses_amount_period: '63500.00',
    },
    projects: [
      {
        id: 1,
        name: 'Riverside Court Renovation',
        client_name: 'Riverside Sports Club',
        status: 'RUNNING',
        sanctioned_budget: '600000.00',
        spent: '492000.00',
        remaining: '108000.00',
        usage_pct: '82.00',
        state: 'warn',
        expected_end_date: day(-30),
      },
      {
        id: 2,
        name: 'Bavdhan Sports Arena',
        client_name: 'Bavdhan Arena LLP',
        status: 'RUNNING',
        sanctioned_budget: '200000.00',
        spent: '40000.00',
        remaining: '160000.00',
        usage_pct: '20.00',
        state: 'ok',
        expected_end_date: null,
      },
      {
        id: 3,
        name: 'Kondhwa Cricket Nets',
        client_name: 'Kondhwa Cricket Assn.',
        status: 'COMPLETED',
        sanctioned_budget: '100000.00',
        spent: '95500.00',
        remaining: '4500.00',
        usage_pct: '95.50',
        state: 'warn',
        expected_end_date: day(10),
      },
    ],
    alerts: [
      {
        project_id: 1,
        project_name: 'Riverside Court Renovation',
        state: 'warn',
        usage_pct: '82.00',
        remaining: '108000.00',
      },
    ],
    recent_expenses: [
      {
        id: 11,
        project_id: 1,
        project_name: 'Riverside Court Renovation',
        category: 'MATERIALS',
        amount: '24000.00',
        spent_on: day(0),
        has_receipt: true,
        is_void: false,
      },
      {
        id: 10,
        project_id: 2,
        project_name: 'Bavdhan Sports Arena',
        category: 'LABOUR',
        amount: '12000.00',
        spent_on: day(1),
        has_receipt: false,
        is_void: false,
      },
      {
        id: 9,
        project_id: 1,
        project_name: 'Riverside Court Renovation',
        category: 'TRANSPORT',
        amount: '3500.00',
        spent_on: day(3),
        has_receipt: false,
        is_void: true,
      },
      {
        id: 8,
        project_id: 1,
        project_name: 'Riverside Court Renovation',
        category: 'EQUIPMENT',
        amount: '24000.00',
        spent_on: day(6),
        has_receipt: true,
        is_void: false,
      },
    ],
    recent_activity: [
      {
        at: iso(5),
        type: 'expense_added',
        project_id: 1,
        project_name: 'Riverside Court Renovation',
        text: 'Expense added: Materials ₹24000.00',
      },
      {
        at: iso(1500),
        type: 'project_completed',
        project_id: 3,
        project_name: 'Kondhwa Cricket Nets',
        text: 'Project marked Completed',
      },
      {
        at: iso(9000),
        type: 'project_assigned',
        project_id: 2,
        project_name: 'Bavdhan Sports Arena',
        text: 'Project assigned to you',
      },
    ],
  };
}

export function emptyPmDashboard(): PmDashboard {
  const base = mockPmDashboard();
  return {
    ...base,
    kpis: {
      projects_running: 0,
      projects_completed: 0,
      total_sanctioned: '0.00',
      total_spent: '0.00',
      total_remaining: '0.00',
      expenses_logged_period: 0,
      expenses_amount_period: '0.00',
    },
    projects: [],
    alerts: [],
    recent_expenses: [],
    recent_activity: [],
  };
}
