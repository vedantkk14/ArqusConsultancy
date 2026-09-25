/** Review fixture for `environment.useMocks`. Shape mirrors GET /dashboard/sales-exec exactly. */

import { Period } from '../dashboard.models';
import { ExecLeadItem, SalesExecDashboard } from './sales-exec-dashboard.models';

function lead(id: number, name: string, overrides: Partial<ExecLeadItem> = {}): ExecLeadItem {
  return {
    id,
    name,
    phone: '+919876500000',
    source: 'REFERRAL',
    status: 'CONTACTED',
    created_at: new Date().toISOString(),
    next_followup_at: null,
    days_overdue: 0,
    last_note: 'Shared the brochure and past projects.',
    last_interaction_at: new Date().toISOString(),
    proposed_amount: '250000.00',
    ...overrides,
  };
}

export function mockSalesExecDashboard(period: Period): SalesExecDashboard {
  const now = new Date().toISOString();
  return {
    as_of: now,
    business_date: now.slice(0, 10),
    period: { key: period, from: null, to: now.slice(0, 10) },
    kpis: {
      open_leads: 11,
      new_untouched: 2,
      followups_today: 3,
      overdue: 4,
      won_count: 6,
      lost_count: 2,
      conversion_pct: '75.0',
      won_value: '1321000.00',
    },
    queues: {
      overdue: {
        total: 4,
        items: [
          lead(1, 'Deccan Sports Academy', { days_overdue: 3 }),
          lead(2, 'Vikram Desai', { status: 'INTERESTED', days_overdue: 1 }),
        ],
      },
      today: {
        total: 3,
        items: [lead(3, 'Nashik Cricket Club', { status: 'INTERESTED', next_followup_at: now })],
      },
      new_leads: {
        total: 2,
        items: [
          lead(4, 'Goa Football Club', { status: 'NEW', proposed_amount: null }),
          lead(5, 'Aarav Joshi', { status: 'NEW', proposed_amount: null }),
        ],
      },
      no_followup: {
        total: 1,
        items: [lead(6, 'Rohit Pawar', { status: 'NEW', proposed_amount: null })],
      },
    },
    pipeline: [
      { status: 'NEW', count: 3 },
      { status: 'CONTACTED', count: 4 },
      { status: 'INTERESTED', count: 4 },
      { status: 'WON', count: 6 },
      { status: 'LOST', count: 2 },
    ],
    upcoming: [
      { date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), count: 2, items: [lead(7, 'Karan Mehta')] },
      { date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), count: 1, items: [lead(8, 'Meera Iyer')] },
    ],
    recent_activity: [
      { at: now, lead_id: 1, lead_name: 'Deccan Sports Academy', type: 'CALL', text: 'Discussed scope and timelines.' },
      { at: now, lead_id: 3, lead_name: 'Nashik Cricket Club', type: 'WHATSAPP', text: 'Sent a revised quote.' },
    ],
  };
}
