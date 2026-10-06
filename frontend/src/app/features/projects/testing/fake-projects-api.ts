import { Observable, Subject, of } from 'rxjs';
import { QueryParams } from '../../../core/api/api.service';
import { PaginatedResponse } from '../../../core/models';
import {
  ConvertibleLead,
  Expense,
  ExpenseSummary,
  Manager,
  ProjectDetail,
  ProjectEvent,
  ProjectListItem,
  ProjectSummary,
} from '../data/project.models';
import { UploadEvent } from '../data/projects-api.service';

export function page<T>(results: T[], count = results.length): PaginatedResponse<T> {
  return { count, next: null, previous: null, results };
}

export function makeProject(id: number, patch: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id,
    name: `Project ${id}`,
    client_name: `Client ${id}`,
    status: 'RUNNING',
    start_date: '2026-08-01',
    expected_end_date: '2026-12-01',
    completed_at: null,
    created_at: '2026-08-01T06:30:00Z',
    pm_name: 'Paul Project',
    pm: { id: 4, name: 'Paul Project' },
    spent: '120000.00',
    total_budget: '1000000.00',
    remaining: '880000.00',
    usage_pct: '12.00',
    state: 'ok',
    ...patch,
  };
}

/** A project as a project manager sees it: no `pm` object, no budget, no lead, no finance. */
export function makePmProject(id: number, patch: Partial<ProjectListItem> = {}): ProjectListItem {
  const project = makeProject(id, patch);
  delete project.pm;
  delete project.total_budget;
  delete project.remaining;
  delete project.usage_pct;
  delete project.state;
  return project;
}

export function makeDetail(id: number, patch: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    ...makeProject(id),
    scope: 'Full turf install',
    allowed_actions: ['add_expense', 'complete', 'reassign', 'edit'],
    lead_id: 9,
    finance: {
      total_amount: '1000000.00',
      received: '400000.00',
      outstanding: '600000.00',
      finalized: true,
      live_margin: '280000.00',
    },
    ...patch,
  };
}

/** A project as a Sales Manager sees it: no money at all (no spent, budget, finance). */
export function makeSmProject(id: number, patch: Partial<ProjectListItem> = {}): ProjectListItem {
  const project = makePmProject(id, patch);
  delete project.spent;
  return { ...project, lead_id: 9 };
}

export function makeSmDetail(id: number, patch: Partial<ProjectDetail> = {}): ProjectDetail {
  const detail = makePmDetail(id, { allowed_actions: ['add_expense'], ...patch });
  delete detail.spent;
  return { ...detail, lead_id: 9 };
}

/** An expense as a Sales Manager sees it: only the ones they logged, with the amount. */
export function makeSmExpense(id: number): Expense {
  return { ...makeExpense(id), logged_by: { id: 9, name: 'Sam Sales' } };
}

export function makePmDetail(id: number, patch: Partial<ProjectDetail> = {}): ProjectDetail {
  const detail = makeDetail(id, { allowed_actions: ['add_expense', 'complete'], ...patch });
  delete detail.pm;
  delete detail.lead_id;
  delete detail.finance;
  delete detail.total_budget;
  delete detail.remaining;
  delete detail.usage_pct;
  delete detail.state;
  return detail;
}

export function makeExpense(id: number, patch: Partial<Expense> = {}): Expense {
  return {
    id,
    project: 1,
    project_name: 'Project 1',
    category: 'MATERIALS',
    category_label: 'Materials',
    amount: '1500.00',
    spent_on: '2026-09-20',
    vendor: 'Shree Traders',
    description: 'Sand',
    has_receipt: true,
    receipt_kind: 'image',
    receipt_type: 'image/png',
    is_void: false,
    void_reason: '',
    logged_by: { id: 4, name: 'Paul Project', role: 'Project Manager' },
    created_at: '2026-09-20T06:30:00Z',
    can_edit: true,
    ...patch,
  };
}

export const SUMMARY: ProjectSummary = {
  running: 5,
  completed: 3,
  ok: 2,
  warn: 1,
  over: 2,
  no_pm: 1,
  budget_total: '3000000.00',
  spent_total: '1900000.00',
};

export const CONVERTIBLE: ConvertibleLead = {
  opportunity: 90,
  sequence_no: 1,
  lead: 9,
  name: 'Kolhapur Kabaddi League',
  exec_name: 'Eva Exec',
  requirements: 'New synthetic turf with floodlights.',
  won_at: '2026-09-01T06:30:00Z',
  proposed_amount: '300000.00',
  total_amount: '300000.00',
  ineligible_reason: null,
  project_id: null,
};

/** Records calls; each list() returns a Subject the test resolves (or fails). */
export class FakeProjectsApi {
  listCalls: QueryParams[] = [];
  expenseCalls: QueryParams[] = [];
  summaryCalls: QueryParams[] = [];
  pending = new Subject<PaginatedResponse<ProjectListItem>>();
  convertible$: Observable<{ count: number; results: ConvertibleLead[] }> = of({
    count: 1,
    results: [CONVERTIBLE],
  });
  convertibleCalls: ({ opportunity?: number; lead?: number } | undefined)[] = [];
  convertResult: Observable<ProjectDetail> = of(makeDetail(1));
  converts: unknown[] = [];
  managersList: Manager[] = [
    { id: 4, name: 'Paul Project', running_projects: 3 },
    { id: 8, name: 'Anita Kulkarni', running_projects: 4 },
  ];
  detail: ProjectDetail = makeDetail(1);
  expenseRows: Expense[] = [makeExpense(1)];
  eventRows: ProjectEvent[] = [];
  actions: { name: string; args: unknown[] }[] = [];
  uploadResult: Observable<UploadEvent> = of({ kind: 'done', expense: makeExpense(2) });
  expenseSummary$: Observable<ExpenseSummary> = of({
    total: '1500.00',
    count: 1,
    void_count: 0,
    by_category: [],
  });

  list(params: QueryParams) {
    this.listCalls.push(params);
    this.pending = new Subject();
    return this.pending;
  }
  summary(params: QueryParams = {}) {
    this.summaryCalls.push(params);
    return of(SUMMARY);
  }
  managers() {
    return of(this.managersList);
  }
  convertible(lookup?: { opportunity?: number; lead?: number }) {
    this.convertibleCalls.push(lookup);
    return this.convertible$;
  }
  convert(body: unknown) {
    this.converts.push(body);
    return this.convertResult;
  }
  get() {
    return of(this.detail);
  }
  getShared() {
    return of(this.detail);
  }
  projectExpenses() {
    return of(page(this.expenseRows));
  }
  expenses(params: QueryParams = {}) {
    this.expenseCalls.push(params);
    return of(page(this.expenseRows));
  }
  expenseSummary() {
    return this.expenseSummary$;
  }
  events() {
    return of(page(this.eventRows));
  }
  addExpense(...args: unknown[]) {
    this.actions.push({ name: 'addExpense', args });
    return this.uploadResult;
  }
  updateExpense(...args: unknown[]) {
    this.actions.push({ name: 'updateExpense', args });
    return this.uploadResult;
  }
  voidExpense(...args: unknown[]) {
    this.actions.push({ name: 'voidExpense', args });
    return of(makeExpense(1, { is_void: true }));
  }
  complete(...args: unknown[]) {
    this.actions.push({ name: 'complete', args });
    return of(makeDetail(1, { status: 'COMPLETED', allowed_actions: ['reopen'] }));
  }
  reopen(...args: unknown[]) {
    this.actions.push({ name: 'reopen', args });
    return of(makeDetail(1));
  }
  assignPm(...args: unknown[]) {
    this.actions.push({ name: 'assignPm', args });
    return of(makeDetail(1));
  }
  receipt() {
    return of(new Blob(['x'], { type: 'image/png' }));
  }
  exportCsv(...args: unknown[]) {
    this.actions.push({ name: 'exportCsv', args });
    return of(new Blob());
  }
}
