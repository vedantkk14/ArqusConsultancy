import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { findNavItem } from '../../../core/config/route-helpers';
import { Role } from '../../../core/models';
import { fakeViewport } from '../../projects/testing/fake-viewport';
import { ProjectsApi } from '../../projects/data/projects-api.service';
import { FakeProjectsApi, makeExpense } from '../../projects/testing/fake-projects-api';
import { EXPENSES_ROUTES } from '../expenses.routes';
import { filtersFromQuery, toQuery } from '../expenses-list.store';
import { ExpensesListPage } from './expenses-list-page';

async function setup(
  role: Role,
  url: string,
  prepare: (api: FakeProjectsApi) => void = () => undefined,
  width = 1440,
) {
  const api = new FakeProjectsApi();
  prepare(api);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'expenses/all', component: ExpensesListPage }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ProjectsApi, useValue: api },
      fakeViewport(width),
    ],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Alice', email: 'a@x.com', role } });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await settle(harness);
  return { api, harness, el: harness.routeNativeElement as HTMLElement };
}

async function settle(harness: RouterTestingHarness) {
  harness.detectChanges();
  await harness.fixture.whenStable();
  harness.detectChanges();
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const overlay = () => document.querySelector('.cdk-overlay-container') as HTMLElement;
const buttonByText = (root: ParentNode, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));
const byLabel = (root: ParentNode, label: string) =>
  root.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`);

const SUMMARY = {
  total: '11430.00',
  count: 4,
  void_count: 1,
  by_category: [
    { category: 'MATERIALS' as const, label: 'Materials', total: '8000.00', count: 2 },
    { category: 'LABOUR' as const, label: 'Labour', total: '3430.00', count: 2 },
  ],
};

describe('ExpensesListPage', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('reads the filters from the URL and sends them with the API names', async () => {
    const { api } = await setup(
      Role.Admin,
      '/expenses/all?category=LABOUR&project=3&has_receipt=false&state=void&q=sand&date_from=2026-09-01',
    );
    expect(api.expenseCalls[0]).toMatchObject({
      category: 'LABOUR',
      project: '3',
      has_receipt: 'false',
      state: 'void',
      q: 'sand',
      date_from: '2026-09-01',
      ordering: '-spent_on',
      page: 1,
    });
    expect(toQuery(filtersFromQuery((k) => (k === 'category' ? 'FOOD' : null)))).toEqual({
      category: 'FOOD',
      ordering: '-spent_on',
    });
  });

  it('shows the server totals for the current filters and a category breakdown', async () => {
    const { el } = await setup(Role.Admin, '/expenses/all', (api) => {
      api.expenseSummary$ = of(SUMMARY);
    });
    const totals = el.querySelector('.totals')!;
    expect(text(totals)).toContain('₹11,430.00');
    expect(text(totals)).toContain('4 expenses · 1 voided, not counted');
    expect(text(totals)).toContain('Materials');
    expect(text(totals)).toContain('₹8,000');
  });

  it('lists expenses with the project as a link and a receipt button', async () => {
    const { el } = await setup(Role.Admin, '/expenses/all', (api) => {
      api.expenseRows = [makeExpense(1, { project: 7, project_name: 'Turf for Acme' })];
    });
    expect(el.querySelector('a[href="/projects/7"]')?.textContent).toContain('Turf for Acme');
    expect(byLabel(el, 'View receipt')).toBeTruthy();
  });

  it('a chip click is written to the URL', async () => {
    const { el, harness } = await setup(Role.Admin, '/expenses/all');
    buttonByText(el, 'Void')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/expenses/all?state=void');
  });

  it('empty and no-results states', async () => {
    const a = await setup(Role.Admin, '/expenses/all', (api) => (api.expenseRows = []));
    expect(text(a.el)).toContain('No expenses yet');
    TestBed.resetTestingModule();
    const b = await setup(Role.Admin, '/expenses/all?q=zzz', (api) => (api.expenseRows = []));
    expect(text(b.el)).toContain('No expenses match these filters');
    expect(buttonByText(b.el, 'Clear filters')).toBeTruthy();
  });

  it('shows an error with retry when loading fails', async () => {
    const { api, el, harness } = await setup(Role.Admin, '/expenses/all', (a) => {
      a.expenses = () =>
        throwError(() => ({ status: 500, code: 'server_error', message: 'x', details: {} }));
    });
    expect(el.querySelector('app-error-state')).toBeTruthy();
    const spy = vi.spyOn(api, 'expenses');
    buttonByText(el, 'Try again')!.click();
    await settle(harness);
    expect(spy).toHaveBeenCalled();
  });

  it('admin can export a CSV and filter by who logged it; a PM can do neither', async () => {
    const a = await setup(Role.Admin, '/expenses/all');
    expect(buttonByText(a.el, 'Export CSV')).toBeTruthy();
    expect(text(a.el)).toContain('Logged by');
    TestBed.resetTestingModule();
    const b = await setup(Role.ProjectManager, '/expenses/all');
    expect(buttonByText(b.el, 'Export CSV')).toBeUndefined();
    expect(b.el.querySelector('app-expense-filters')!.textContent).not.toContain('Logged by');
  });

  it('voids through the reason dialog (with a reason) but offers no Edit here', async () => {
    const { api, el, harness } = await setup(Role.Admin, '/expenses/all');
    byLabel(el, 'More actions: ')!.click();
    await settle(harness);
    expect(buttonByText(document.body, 'Edit')).toBeUndefined();
    buttonByText(document.body, 'Void…')!.click();
    await settle(harness);
    buttonByText(overlay(), 'Void expense')!.click();
    await settle(harness);
    expect(text(overlay())).toContain('Give a reason.');
    const reason = document.getElementById('rd-reason') as HTMLTextAreaElement;
    reason.value = 'Entered twice';
    reason.dispatchEvent(new Event('input'));
    buttonByText(overlay(), 'Void expense')!.click();
    await settle(harness);
    expect(api.actions[0]).toMatchObject({ name: 'voidExpense', args: [1, 'Entered twice'] });
  });
});

describe('expenses routes', () => {
  it('the list is for admin and PM', () => {
    const roles = (path: string) => EXPENSES_ROUTES.find((r) => r.path === path)?.data?.['roles'];
    expect(roles('all')).toEqual(findNavItem('/expenses/all')?.roles);
    expect(roles('all')).toContain(Role.ProjectManager);
    expect(roles('alerts')).toBeUndefined();
    expect(roles('all')).not.toContain(Role.SalesManager);
    expect(roles('all')).not.toContain(Role.SalesExec);
  });
});
