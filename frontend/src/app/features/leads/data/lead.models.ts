/** Shapes of /api/v1/leads (see docs/API_CONTRACT.md). Money is always a decimal string. */

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'WON', 'LOST'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  WON: 'Won',
  LOST: 'Lost',
};

export const LEAD_SOURCES = [
  ['WEBSITE', 'Website'],
  ['REFERRAL', 'Referral'],
  ['INSTAGRAM', 'Instagram'],
  ['FACEBOOK', 'Facebook'],
  ['GOOGLE_ADS', 'Google Ads'],
  ['WALK_IN', 'Walk-in'],
  ['COLD_CALL', 'Cold call'],
  ['EVENT', 'Event'],
  ['OTHER', 'Other'],
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number][0];

export const LOST_REASONS = [
  ['PRICE', 'Price'],
  ['COMPETITOR', 'Went with a competitor'],
  ['NO_RESPONSE', 'No response'],
  ['NOT_INTERESTED', 'Not interested'],
  ['REQUIREMENT_CHANGED', 'Requirement changed'],
  ['OTHER', 'Other'],
] as const;
export type LostReason = (typeof LOST_REASONS)[number][0];

export const USER_INTERACTION_TYPES = ['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE'] as const;
export type UserInteractionType = (typeof USER_INTERACTION_TYPES)[number];
export type InteractionType = UserInteractionType | 'STATUS_CHANGE' | 'ASSIGNMENT' | 'AMOUNT_CHANGE';

export interface Person {
  id: number;
  name: string;
}

export interface LeadListItem {
  id: number;
  name: string;
  phone: string;
  email: string;
  source: LeadSource;
  source_label: string;
  source_other: string;
  status: LeadStatus;
  assigned_to: Person | null;
  next_followup_at: string | null;
  days_overdue: number;
  proposed_amount: string | null;
  last_activity_at: string | null;
  won_at: string | null;
  lost_reason: LostReason | '';
  created_at: string;
  allowed_transitions: LeadStatus[];
}

export interface LeadFinance {
  finalized: boolean;
  total_amount: string | null;
  finalized_at: string | null;
}

export interface LeadDetail extends LeadListItem {
  requirements: string;
  lost_note: string;
  created_by: Person | null;
  updated_at: string;
  interactions_count: number;
  /** Only for roles allowed to see the final amount (Admin, Sales Manager). */
  finance?: LeadFinance;
}

export interface Interaction {
  id: number;
  type: InteractionType;
  notes: string;
  created_by: Person | null;
  created_at: string;
  from_status: LeadStatus | '';
  to_status: LeadStatus | '';
  meta: Record<string, string | number | null>;
}

export interface StatusCount {
  status: LeadStatus;
  count: number;
  value: string;
}

export interface LeadSummary {
  by_status: StatusCount[];
  overdue: number;
  today: number;
  untouched: number;
  no_followup: number;
  won_awaiting: number;
}

export interface Assignee {
  id: number;
  name: string;
  role: 'SALES_EXEC' | 'ADMIN';
  open_count: number;
}

export interface WhatsAppTemplate {
  id: number;
  name: string;
  body: string;
}

export interface DuplicateInfo {
  id: number;
  name: string;
  status: LeadStatus;
  assigned_to_name: string | null;
}

export interface LeadInput {
  name: string;
  phone: string;
  email: string;
  source: LeadSource;
  source_other: string;
  requirements: string;
  assigned_to: number | null;
  next_followup_at: string | null;
  proposed_amount?: string | null;
  force?: boolean;
}

export interface StatusChange {
  status: LeadStatus;
  note?: string;
  lost_reason?: LostReason;
  lost_note?: string;
  proposed_amount?: string;
  next_followup_at?: string | null;
}

export interface NewInteraction {
  type: UserInteractionType;
  notes: string;
  next_followup_at?: string | null;
  new_status?: LeadStatus | null;
  lost_reason?: LostReason;
  proposed_amount?: string;
}

// ---- List filters (the URL query uses the API's names) ---------------------------------------------

export type ListMode = 'all' | 'overdue' | 'won-awaiting';
export type FollowupFilter = '' | 'overdue' | 'today' | 'upcoming' | 'none';

export interface LeadFilters {
  q: string;
  status: LeadStatus | '';
  assigned_to: string;
  source: string;
  followup: FollowupFilter;
  created_from: string;
  created_to: string;
  ordering: string;
}

export const EMPTY_FILTERS: LeadFilters = {
  q: '',
  status: '',
  assigned_to: '',
  source: '',
  followup: '',
  created_from: '',
  created_to: '',
  ordering: '',
};

export const ORDERINGS: { value: string; label: string }[] = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'next_followup_at', label: 'Next follow-up' },
  { value: '-days_overdue', label: 'Most overdue' },
  { value: '-proposed_amount', label: 'Highest value' },
  { value: '-last_activity_at', label: 'Recent activity' },
];
