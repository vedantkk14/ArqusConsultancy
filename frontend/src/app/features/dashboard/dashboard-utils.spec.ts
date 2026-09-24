import { DASHBOARD_MOCK } from './dashboard.mock';
import { composeInsight, relativeTime } from './dashboard-utils';

describe('composeInsight', () => {
  it('joins every non-zero part with a middle dot', () => {
    expect(composeInsight(DASHBOARD_MOCK)).toBe(
      '₹6,40,000 overdue across 4 clients · 11 follow-ups overdue · 3 won deals waiting for a final amount · 2 projects over budget',
    );
  });

  it('skips zero parts and uses the singular', () => {
    const attention = [
      { key: 'overdue_payments', label: '', count: 0, severity: 'high' as const, route: '' },
      { key: 'overdue_followups', label: '', count: 1, severity: 'high' as const, route: '' },
      { key: 'budget_alerts', label: '', count: 0, severity: 'medium' as const, route: '' },
    ];
    expect(composeInsight({ kpis: DASHBOARD_MOCK.kpis, attention })).toBe('1 follow-up overdue');
  });

  it('says all caught up when nothing is waiting', () => {
    expect(composeInsight({ kpis: DASHBOARD_MOCK.kpis, attention: [] })).toBe("You're all caught up.");
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  it('reads naturally', () => {
    expect(relativeTime('2026-09-24T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-09-24T11:55:00Z', now)).toBe('5 min ago');
    expect(relativeTime('2026-09-24T09:00:00Z', now)).toBe('3 h ago');
    expect(relativeTime('2026-09-23T10:00:00Z', now)).toBe('yesterday');
  });
});
