import { AppNotification } from './notifications.models';

export interface TypeMeta {
  icon: string;
  tone: 'cyan' | 'teal' | 'amber' | 'rose' | 'slate';
}

/** Icon and tint per notification type. Unknown types fall back to a neutral bell. */
export const TYPE_META: Record<string, TypeMeta> = {
  lead_assigned: { icon: 'person_add', tone: 'cyan' },
  lead_reassigned_away: { icon: 'swap_horiz', tone: 'slate' },
  lead_won: { icon: 'emoji_events', tone: 'teal' },
  lead_won_reversed: { icon: 'undo', tone: 'rose' },
  budget_warn: { icon: 'warning', tone: 'amber' },
  budget_over: { icon: 'error', tone: 'rose' },
  payment_received: { icon: 'payments', tone: 'teal' },
  account_created: { icon: 'celebration', tone: 'cyan' },
  expense_added: { icon: 'receipt_long', tone: 'amber' },
  payment_voided: { icon: 'block', tone: 'rose' },
  payment_overdue: { icon: 'schedule', tone: 'rose' },
  deal_finalized: { icon: 'verified', tone: 'teal' },
  project_assigned: { icon: 'assignment_ind', tone: 'cyan' },
  project_unassigned: { icon: 'swap_horiz', tone: 'slate' },
  project_completed: { icon: 'task_alt', tone: 'teal' },
  project_reopened: { icon: 'replay', tone: 'amber' },
  budget_changed: { icon: 'tune', tone: 'cyan' },
  budget_requested: { icon: 'request_quote', tone: 'amber' },
  budget_request_approved: { icon: 'thumb_up', tone: 'teal' },
  budget_request_rejected: { icon: 'thumb_down', tone: 'rose' },
};
const FALLBACK: TypeMeta = { icon: 'notifications', tone: 'slate' };

export const metaFor = (type: string): TypeMeta => TYPE_META[type] ?? FALLBACK;

/** Where tapping a notification goes; null when there is nowhere useful to go. */
export function routeFor(n: Pick<AppNotification, 'type' | 'data'>): unknown[] | null {
  const leadId = Number(n.data?.['lead_id']);
  if (n.type.startsWith('lead_')) {
    return leadId ? ['/leads', leadId] : ['/leads/all'];
  }
  if (n.type === 'budget_warn' || n.type === 'budget_over') {
    return ['/expenses/alerts'];
  }
  const projectId = Number(n.data?.['project_id']);
  if (n.type.startsWith('project_') || n.type === 'expense_added' || n.type === 'budget_changed' || n.type.startsWith('budget_request')) {
    return projectId ? ['/projects', projectId] : ['/projects/running'];
  }
  const ledgerId = Number(n.data?.['ledger_id']);
  if (n.type.startsWith('payment_')) {
    return ledgerId ? ['/accounts/ledgers', ledgerId] : ['/accounts/payments'];
  }
  return null;
}
