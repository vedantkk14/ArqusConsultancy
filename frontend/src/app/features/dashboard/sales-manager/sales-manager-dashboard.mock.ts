/** Review fixture for `environment.useMocks`. Shape mirrors GET /dashboard/sales-manager exactly. */

import { Period } from '../dashboard.models';
import { QueueLeadItem, SalesManagerDashboard } from './sales-manager-dashboard.models';

function lead(id: number, name: string, overrides: Partial<QueueLeadItem> = {}): QueueLeadItem {
  return {
    id,
    name,
    phone: '+919876500000',
    status: 'CONTACTED',
    source_label: 'Referral',
    next_followup_at: null,
    days_overdue: 0,
    proposed_amount: '250000.00',
    last_note: 'Shared the brochure and past projects.',
    assigned_to: { id: 1, name: 'Eva Exec' },
    ...overrides,
  };
}

export function mockSalesManagerDashboard(period: Period): SalesManagerDashboard {
  const now = new Date().toISOString();
  return {
    as_of: now,
    business_date: now.slice(0, 10),
    period: { key: period, from: null, to: now.slice(0, 10) },
    kpis: {
      team_open_leads: 24,
      team_new_untouched: 4,
      team_followups_today: 3,
      team_overdue: 6,
      team_won_count: 9,
      team_lost_count: 4,
      team_conversion_pct: '69.2',
      team_won_value: '2150000.00',
      unassigned_leads: 2,
    },
    queues: {
      overdue: {
        total: 6,
        items: [
          lead(101, 'Deccan Sports Academy', { days_overdue: 3, next_followup_at: now }),
          lead(102, 'Vikram Desai', { days_overdue: 1, next_followup_at: now, assigned_to: { id: 2, name: 'Rohan Mehta' } }),
        ],
      },
      today: {
        total: 3,
        items: [lead(103, 'Nashik Cricket Club', { status: 'INTERESTED', next_followup_at: now })],
      },
      unassigned: {
        total: 2,
        items: [
          { ...lead(104, 'Goa Football Club', { status: 'NEW' }), assigned_to: undefined },
          { ...lead(105, 'Aarav Joshi', { status: 'NEW' }), assigned_to: undefined },
        ],
      },
      won_awaiting: {
        total: 2,
        items: [lead(106, 'Kolhapur Kabaddi League', { status: 'WON', proposed_amount: '480000.00' })],
      },
    },
    by_executive: [
      { id: 2, name: 'Rohan Mehta', open_leads: 11, overdue: 4, won_count: 3, won_value: '975000.00', conversion_pct: '60.0', load_score: 19 },
      { id: 1, name: 'Eva Exec', open_leads: 8, overdue: 2, won_count: 4, won_value: '1250000.00', conversion_pct: '66.7', load_score: 12 },
      { id: 3, name: 'Priya Nair', open_leads: 5, overdue: 0, won_count: 2, won_value: '600000.00', conversion_pct: '100.0', load_score: 5 },
      { id: 4, name: 'Nina Newuser', open_leads: 0, overdue: 0, won_count: 0, won_value: '0.00', conversion_pct: '0.0', load_score: 0 },
    ],
    pipeline: [
      { status: 'NEW', count: 8 },
      { status: 'CONTACTED', count: 7 },
      { status: 'INTERESTED', count: 5 },
      { status: 'WON', count: 9 },
      { status: 'LOST', count: 4 },
    ],
    recent_activity: [
      { at: now, exec_name: 'Rohan Mehta', lead_id: 35, lead_name: 'Ratnagiri Rowing Club', type: 'MEETING', text: 'Shared the brochure and past projects.' },
      { at: now, exec_name: 'Eva Exec', lead_id: 12, lead_name: 'Aarav Joshi', type: 'CALL', text: 'Discussed scope and timelines.' },
    ],
  };
}
