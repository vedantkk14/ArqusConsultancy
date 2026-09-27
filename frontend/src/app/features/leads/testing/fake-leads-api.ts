import { Observable, Subject, of } from 'rxjs';
import { QueryParams } from '../../../core/api/api.service';
import { PaginatedResponse } from '../../../core/models';
import { LeadDetail, LeadListItem, LeadSummary } from '../data/lead.models';

export function makeLead(id: number, patch: Partial<LeadDetail> = {}): LeadDetail {
  return {
    id,
    name: `Lead ${id}`,
    phone: `+9198000000${String(id).padStart(2, '0')}`,
    email: '',
    source: 'WEBSITE',
    source_label: 'Website',
    source_other: '',
    status: 'NEW',
    assigned_to: { id: 7, name: 'Eva Exec' },
    next_followup_at: null,
    days_overdue: 0,
    proposed_amount: null,
    last_activity_at: null,
    won_at: null,
    lost_reason: '',
    created_at: '2026-09-01T06:30:00Z',
    allowed_transitions: ['CONTACTED', 'LOST'],
    requirements: '',
    lost_note: '',
    created_by: null,
    updated_at: '2026-09-01T06:30:00Z',
    interactions_count: 0,
    ...patch,
  };
}

export const SUMMARY: LeadSummary = {
  by_status: [
    { status: 'NEW', count: 2, value: '0.00' },
    { status: 'CONTACTED', count: 1, value: '150000.00' },
    { status: 'INTERESTED', count: 0, value: '0.00' },
    { status: 'WON', count: 1, value: '400000.00' },
    { status: 'LOST', count: 0, value: '0.00' },
  ],
  overdue: 2,
  today: 0,
  untouched: 1,
  no_followup: 1,
  won_awaiting: 1,
};

export function page<T>(results: T[], count = results.length): PaginatedResponse<T> {
  return { count, next: null, previous: null, results };
}

/** Records calls; each list() returns a Subject the test resolves (or fails). */
export class FakeLeadsApi {
  listCalls: QueryParams[] = [];
  pending = new Subject<PaginatedResponse<LeadListItem>>();
  updateResult: Observable<LeadDetail> = of(makeLead(1));
  statusResult: Observable<LeadDetail> = of(makeLead(1, { status: 'CONTACTED' }));
  updates: { id: number; body: unknown }[] = [];
  statusCalls: { id: number; body: unknown }[] = [];
  duplicate: unknown = null;

  list(params: QueryParams) {
    this.listCalls.push(params);
    this.pending = new Subject();
    return this.pending;
  }
  summary() {
    return of(SUMMARY);
  }
  assignees() {
    return of([{ id: 7, name: 'Eva Exec', role: 'SALES_EXEC', open_count: 3 }]);
  }
  update(id: number, body: unknown) {
    this.updates.push({ id, body });
    return this.updateResult;
  }
  changeStatus(id: number, body: unknown) {
    this.statusCalls.push({ id, body });
    return this.statusResult;
  }
  checkDuplicate() {
    return of({ existing: this.duplicate });
  }
  templates() {
    return of([]);
  }
  exportCsv() {
    return of(new Blob());
  }
  importTemplate() {
    return of(new Blob());
  }
}
