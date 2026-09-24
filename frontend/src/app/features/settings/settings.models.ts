export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditEntry {
  id: number;
  actor: { id: number; name: string } | null;
  action: AuditAction;
  model_label: string;
  object_id: string;
  object_repr: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  created_at: string;
}

export interface Profile {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  commission_rate: string | null;
}

export const ACTION_LABELS: Record<AuditAction, string> = { CREATE: 'Created', UPDATE: 'Updated', DELETE: 'Deleted' };

/** "leads.Lead" -> "Lead". */
export function modelName(label: string): string {
  return label.split('.').pop() ?? label;
}

/** A recorded value as text; empty values read as an em dash. */
export function showValue(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

/** "next_followup_at" -> "Next followup at". */
export function fieldLabel(name: string): string {
  const text = name.replace(/_id$/, '').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
