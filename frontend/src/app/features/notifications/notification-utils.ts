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
};
const FALLBACK: TypeMeta = { icon: 'notifications', tone: 'slate' };

export const metaFor = (type: string): TypeMeta => TYPE_META[type] ?? FALLBACK;

/** Where tapping a notification goes; null when there is nowhere useful to go. */
export function routeFor(n: Pick<AppNotification, 'type' | 'data'>): unknown[] | null {
  const leadId = Number(n.data?.['lead_id']);
  if (n.type.startsWith('lead_')) {
    return leadId ? ['/leads', leadId] : ['/leads/all'];
  }
  if (n.type.startsWith('budget_')) {
    return ['/expenses/alerts'];
  }
  if (n.type === 'payment_received') {
    return ['/accounts/payments'];
  }
  return null;
}
