import { AdminDashboard, Period } from './dashboard.models';

/**
 * Review fixture for `environment.useMocks`. The backend returns real zeros until the leads, projects and
 * accounts models exist; this lets the dashboard be reviewed with realistic numbers meanwhile.
 * Shape must match GET /api/v1/dashboard/admin (see docs/API_CONTRACT.md).
 */
export const DASHBOARD_MOCK: AdminDashboard = {
  period: 'month',
  range: { start: '2026-09-01', end: '2026-09-24', prev_start: '2026-08-01', prev_end: '2026-08-31' },
  data_sources: { leads: true, projects: true, accounts: true, expenses: true },
  kpis: {
    received: '1845000.00',
    received_prev: '1641500.00',
    received_delta_pct: '12.4',
    outstanding: '2310500.00',
    outstanding_clients: 9,
    outstanding_overdue: '640000.00',
    leads_total: 212,
    leads_new: 31,
    leads_new_prev: 26,
    open_count: 47,
    open_value: '8620000.00',
    won_count: 18,
    lost_count: 6,
    win_rate_pct: '75.0',
    projects_running: 7,
    projects_completed: 12,
  },
  trends: {
    months: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
    leads_new: [18, 24, 21, 29, 26, 31],
    received: ['980000.00', '1210000.00', '1105000.00', '1480000.00', '1641500.00', '1845000.00'],
  },
  cashflow: {
    months: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
    collected: ['980000.00', '1210000.00', '1105000.00', '1480000.00', '1641500.00', '1845000.00'],
    spent: ['720000.00', '805000.00', '910000.00', '870000.00', '1020000.00', '940000.00'],
  },
  attention: [
    { key: 'overdue_payments', label: 'Payments overdue', count: 4, severity: 'high', route: '/accounts/pending' },
    { key: 'overdue_followups', label: 'Overdue follow-ups', count: 11, severity: 'high', route: '/leads/overdue' },
    { key: 'budget_alerts', label: 'Projects over budget', count: 2, severity: 'medium', route: '/expenses/alerts' },
    {
      key: 'won_awaiting_finalization',
      label: 'Won deals awaiting finalisation',
      count: 3,
      severity: 'medium',
      route: '/leads/won-awaiting',
    },
  ],
  funnel: [
    { status: 'NEW', label: 'New', count: 64 },
    { status: 'CONTACTED', label: 'Contacted', count: 41 },
    { status: 'PROPOSAL', label: 'Proposal sent', count: 27 },
    { status: 'NEGOTIATION', label: 'Negotiation', count: 14 },
    { status: 'WON', label: 'Won', count: 18 },
  ],
  sales_by_exec: [
    { user_id: 3, name: 'Eva Exec', won_count: 7, won_value: '3240000.00' },
    { user_id: 5, name: 'Rohan Mehta', won_count: 5, won_value: '2475000.00' },
    { user_id: 6, name: 'Priya Nair', won_count: 4, won_value: '1810000.00' },
    { user_id: 7, name: 'Arjun Rao', won_count: 2, won_value: '690000.00' },
  ],
  recent: {
    payments: [
      { date: '2026-09-23', client: 'Pune Strikers FC', reference: 'NEFT 2231', amount: '250000.00' },
      { date: '2026-09-21', client: 'Deccan Sports Academy', reference: 'UPI 8812', amount: '75000.00' },
      { date: '2026-09-18', client: 'Mumbai Arena Pvt Ltd', reference: 'RTGS 1190', amount: '420000.00' },
      { date: '2026-09-12', client: 'Nashik Cricket Club', reference: 'Cheque 0045', amount: '130000.00' },
    ],
    expenses: [
      { date: '2026-09-22', project: 'Turf installation, Baner', category: 'Materials', amount: '185000.00' },
      { date: '2026-09-20', project: 'Stadium lighting audit', category: 'Travel', amount: '18400.00' },
      { date: '2026-09-17', project: 'Academy feasibility study', category: 'Consultants', amount: '96000.00' },
    ],
    activity: [
      { when: '2026-09-24T09:40:00Z', actor: 'Eva Exec', action: 'Marked "Deccan Sports Academy" as won' },
      { when: '2026-09-23T16:05:00Z', actor: 'Alice Admin', action: 'Recorded a payment of ₹2,50,000' },
      { when: '2026-09-23T11:20:00Z', actor: 'Paul Project', action: 'Added an expense to "Turf installation"' },
    ],
  },
};

/** The fixture for a given period ("All" has no comparison, so no delta). */
export function mockDashboard(period: Period): AdminDashboard {
  return {
    ...DASHBOARD_MOCK,
    period,
    kpis: {
      ...DASHBOARD_MOCK.kpis,
      received_delta_pct: period === 'all' ? null : DASHBOARD_MOCK.kpis.received_delta_pct,
    },
  };
}
