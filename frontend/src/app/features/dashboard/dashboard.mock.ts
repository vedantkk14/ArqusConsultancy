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
    spent: '940000.00',
    net: '905000.00',
    net_margin_pct: '49.1',
    collection_rate_pct: '62.4',
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
    net: ['260000.00', '405000.00', '195000.00', '610000.00', '621500.00', '905000.00'],
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
    { status: 'NEW', label: 'New', count: 64, value: '9600000.00' },
    { status: 'CONTACTED', label: 'Contacted', count: 41, value: '6150000.00' },
    { status: 'PROPOSAL', label: 'Proposal sent', count: 27, value: '4860000.00' },
    { status: 'NEGOTIATION', label: 'Negotiation', count: 14, value: '3010000.00' },
    { status: 'WON', label: 'Won', count: 18, value: '8215000.00' },
  ],
  sales_by_exec: [
    { user_id: 3, name: 'Eva Exec', won_count: 7, won_value: '3240000.00', share_pct: '100.0', win_rate_pct: '77.8' },
    { user_id: 5, name: 'Rohan Mehta', won_count: 5, won_value: '2475000.00', share_pct: '76.4', win_rate_pct: '71.4' },
    { user_id: 6, name: 'Priya Nair', won_count: 4, won_value: '1810000.00', share_pct: '55.9', win_rate_pct: '80.0' },
    { user_id: 7, name: 'Arjun Rao', won_count: 2, won_value: '690000.00', share_pct: '21.3', win_rate_pct: '50.0' },
    { user_id: 8, name: 'Meera Joshi', won_count: 1, won_value: '420000.00', share_pct: '13.0', win_rate_pct: '33.3' },
  ],
  lead_sources: [
    { source: 'Referral', count: 66, pct: '31.1' },
    { source: 'Website', count: 48, pct: '22.6' },
    { source: 'Events', count: 37, pct: '17.5' },
    { source: 'Cold outreach', count: 29, pct: '13.7' },
    { source: 'Social media', count: 21, pct: '9.9' },
    { source: 'Other', count: 11, pct: '5.2' },
  ],
  collections_aging: [
    { bucket: '0-30', count: 3, amount: '910500.00' },
    { bucket: '31-60', count: 2, amount: '760000.00' },
    { bucket: '61-90', count: 2, amount: '420000.00' },
    { bucket: '90+', count: 2, amount: '220000.00' },
  ],
  top_overdue_clients: [
    { ledger_id: 14, client: 'Nashik Cricket Club', outstanding: '140000.00', days: 118 },
    { ledger_id: 9, client: 'Kolhapur Kabaddi League', outstanding: '80000.00', days: 96 },
    { ledger_id: 21, client: 'Deccan Sports Academy', outstanding: '260000.00', days: 74 },
  ],
  projects_burn: [
    { id: 5, name: 'Stadium lighting audit', sanctioned: '800000.00', spent: '868000.00', pct: '108.5', state: 'over' },
    { id: 2, name: 'Turf installation, Baner', sanctioned: '1500000.00', spent: '1305000.00', pct: '87.0', state: 'warn' },
    { id: 7, name: 'Academy feasibility study', sanctioned: '600000.00', spent: '402000.00', pct: '67.0', state: 'ok' },
    { id: 3, name: 'Arena seating redesign', sanctioned: '1200000.00', spent: '576000.00', pct: '48.0', state: 'ok' },
    { id: 9, name: 'Club membership portal', sanctioned: '450000.00', spent: '126000.00', pct: '28.0', state: 'ok' },
  ],
  recent: {
    payments: [
      { date: '2026-09-23', client: 'Pune Strikers FC', reference: 'NEFT 2231', amount: '250000.00' },
      { date: '2026-09-21', client: 'Deccan Sports Academy', reference: 'UPI 8812', amount: '75000.00' },
      { date: '2026-09-18', client: 'Mumbai Arena Pvt Ltd', reference: 'RTGS 1190', amount: '420000.00' },
      { date: '2026-09-12', client: 'Nashik Cricket Club', reference: 'Cheque 0045', amount: '130000.00' },
      { date: '2026-09-08', client: 'Kolhapur Kabaddi League', reference: 'NEFT 2104', amount: '95000.00' },
    ],
    expenses: [
      { date: '2026-09-22', project: 'Turf installation, Baner', category: 'Materials', amount: '185000.00' },
      { date: '2026-09-20', project: 'Stadium lighting audit', category: 'Travel', amount: '18400.00' },
      { date: '2026-09-17', project: 'Academy feasibility study', category: 'Consultants', amount: '96000.00' },
      { date: '2026-09-14', project: 'Arena seating redesign', category: 'Materials', amount: '212000.00' },
      { date: '2026-09-09', project: 'Stadium lighting audit', category: 'Equipment hire', amount: '64000.00' },
    ],
    activity: [
      { when: '2026-09-24T09:40:00Z', actor: 'Eva Exec', action: 'Marked "Deccan Sports Academy" as won', type: 'lead' },
      { when: '2026-09-23T16:05:00Z', actor: 'Alice Admin', action: 'Recorded a payment of ₹2,50,000', type: 'payment' },
      { when: '2026-09-23T11:20:00Z', actor: 'Paul Project', action: 'Added an expense to "Turf installation"', type: 'expense' },
      { when: '2026-09-22T15:10:00Z', actor: 'Sam Manager', action: 'Assigned 6 new leads to Rohan Mehta', type: 'lead' },
      { when: '2026-09-22T10:02:00Z', actor: 'Paul Project', action: 'Moved "Arena seating redesign" to Running', type: 'project' },
      { when: '2026-09-21T18:45:00Z', actor: 'Alice Admin', action: 'Created the user Meera Joshi', type: 'user' },
      { when: '2026-09-21T12:30:00Z', actor: 'Alice Admin', action: 'Recorded a payment of ₹75,000', type: 'payment' },
      { when: '2026-09-20T09:15:00Z', actor: 'Priya Nair', action: 'Sent a proposal to Pune Strikers FC', type: 'lead' },
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
