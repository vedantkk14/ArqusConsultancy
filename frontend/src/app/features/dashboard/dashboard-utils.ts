import { formatInr } from '../../shared/money/inr.pipe';
import { AdminDashboard } from './dashboard.models';

/**
 * One-line summary for the page header from values the API already sent (money is never computed here).
 * Parts with a zero count are skipped; nothing to report -> "You're all caught up."
 */
export function composeInsight(d: Pick<AdminDashboard, 'kpis' | 'attention'>): string {
  const count = (key: string) => d.attention.find((a) => a.key === key)?.count ?? 0;
  const parts: string[] = [];

  const overdueClients = count('overdue_payments');
  if (overdueClients > 0 && d.kpis.outstanding_overdue !== '0.00') {
    parts.push(
      `${formatInr(d.kpis.outstanding_overdue)} overdue across ${overdueClients} ${overdueClients === 1 ? 'client' : 'clients'}`,
    );
  }
  const followups = count('overdue_followups');
  if (followups > 0) {
    parts.push(`${followups} ${followups === 1 ? 'follow-up' : 'follow-ups'} overdue`);
  }
  const won = count('won_awaiting_finalization');
  if (won > 0) {
    parts.push(`${won} won ${won === 1 ? 'deal' : 'deals'} waiting for a final amount`);
  }
  const overBudget = count('budget_alerts');
  if (overBudget > 0) {
    parts.push(`${overBudget} ${overBudget === 1 ? 'project' : 'projects'} over budget`);
  }
  return parts.length ? parts.join(' · ') : "You're all caught up.";
}

/** "just now", "2 min ago", "3 h ago", "yesterday", "4 days ago", or a short date. */
export function relativeTime(when: string | Date, now: Date = new Date()): string {
  const then = typeof when === 'string' ? new Date(when) : when;
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 45) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.round(hours / 24);
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Shorter, non-wrapping labels for the "Waiting on you" rows (the full label goes in `title`). */
export const ATTENTION_SHORT_LABELS: Record<string, string> = {
  overdue_payments: 'Payments overdue',
  overdue_followups: 'Follow-ups overdue',
  budget_alerts: 'Projects over budget',
  won_awaiting_finalization: 'Won deals to finalise',
};

/** Sidebar badge per section, from the attention counts: route -> count + tone. */
export const NAV_BADGE_SOURCES: { route: string; key: string; tone: 'rose' | 'amber' }[] = [
  { route: '/leads', key: 'overdue_followups', tone: 'rose' },
  { route: '/accounts', key: 'overdue_payments', tone: 'rose' },
  { route: '/projects', key: 'budget_alerts', tone: 'amber' },
];
