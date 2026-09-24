import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { fakeViewport } from '../testing/fake-viewport';
import { activeChip, filtersFromQuery, listInsight, toQuery } from '../data/projects-list.store';
import { EMPTY_FILTERS } from '../data/project.models';
import { ProjectsApi } from '../data/projects-api.service';
import { FakeProjectsApi, makePmProject, makeProject, page } from '../testing/fake-projects-api';
import { ProjectsListPage } from './projects-list-page';

async function setup(role: Role = Role.Admin, url = '/projects/running') {
  const api = new FakeProjectsApi();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'projects/running', component: ProjectsListPage, data: { mode: 'running' } },
        { path: 'projects/completed', component: ProjectsListPage, data: { mode: 'completed' } },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ProjectsApi, useValue: api },
      fakeViewport(1440),
    ],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Alice Admin', email: 'a@x.com', role } });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ProjectsListPage);
  const el = harness.routeNativeElement as HTMLElement;
  const resolve = (rows = [makeProject(1), makeProject(2, { state: 'warn', usage_pct: '85.00' })], count?: number) => {
    api.pending.next(page(rows, count));
    harness.detectChanges();
  };
  return { api, harness, el, resolve };
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const buttonByText = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));

describe('ProjectsListPage', () => {
  beforeEach(() => localStorage.clear());

  it('reads filters from the URL and sends them with the API names', async () => {
    const { api } = await setup(Role.Admin, '/projects/running?state=warn&q=turf&pm=none&ordering=name');
    expect(api.listCalls[0]).toMatchObject({ status: 'RUNNING', state: 'warn', q: 'turf', pm: 'none', ordering: 'name', page: 1 });
  });

  it('lands dashboard links (over_budget, no_pm) on the filtered list', async () => {
    const a = await setup(Role.Admin, '/projects/running?over_budget=true');
    expect(a.api.listCalls[0]).toMatchObject({ over_budget: 'true', status: 'RUNNING' });
    expect(text(a.el.querySelector('.chips [aria-pressed=true]'))).toContain('Near limit or over');
  });

  it('writes a chip click back to the URL and reloads', async () => {
    const { api, el, resolve, harness } = await setup();
    resolve();
    buttonByText(el, 'Over budget')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/projects/running?state=over');
    expect(api.listCalls.at(-1)).toMatchObject({ state: 'over' });
  });

  it('shows skeletons, then rows, with the insight line from the summary', async () => {
    const { el, resolve } = await setup();
    expect(el.querySelectorAll('app-project-rows app-skeleton').length).toBeGreaterThan(0);
    resolve();
    expect(el.querySelectorAll('app-project-rows a.stretch').length).toBe(2);
    expect(text(el.querySelector('.count'))).toBe('2 projects');
    expect(text(el.querySelector('.insight'))).toBe('2 over budget · 1 near limit · 1 without a project manager');
  });

  it('shows an error with retry when the first load fails', async () => {
    const { api, el, harness } = await setup();
    api.pending.error({ status: 500, code: 'server_error', message: 'x', details: {} });
    harness.detectChanges();
    expect(el.querySelector('app-error-state')).toBeTruthy();
    buttonByText(el, 'Try again')!.click();
    expect(api.listCalls.length).toBe(2);
  });

  it('empty states: running, no results with Clear filters, and a PM with nothing assigned', async () => {
    const a = await setup();
    a.resolve([]);
    expect(text(a.el)).toContain('No running projects');
    TestBed.resetTestingModule();

    const b = await setup(Role.Admin, '/projects/running?q=zzz');
    b.resolve([]);
    expect(text(b.el)).toContain('No projects match these filters');
    expect(buttonByText(b.el, 'Clear filters')).toBeTruthy();
    TestBed.resetTestingModule();

    const c = await setup(Role.ProjectManager);
    c.resolve([]);
    expect(text(c.el)).toContain('No projects assigned yet');
  });

  it('a project manager has no PM filter, no Assign action and no convert link', async () => {
    const { el, resolve } = await setup(Role.ProjectManager);
    resolve([makePmProject(1, { pm_name: null })]);
    const filters = text(el.querySelector('app-project-filters'));
    expect(filters).not.toContain('Project manager'); // the manager filter is admin-only
    expect(filters).not.toContain('No project manager'); // and so is its chip
    expect(buttonByText(el, 'Assign')).toBeUndefined();
    expect(el.querySelector('a[href="/projects/convert"]')).toBeNull();
  });

  it('admin sees the "No PM" pill with an Assign action', async () => {
    const { el, resolve } = await setup();
    resolve([makeProject(1, { pm_name: null, pm: null })]);
    expect(text(el)).toContain('No PM');
    expect(buttonByText(el, 'Assign')).toBeTruthy();
  });
});

describe('project list helpers', () => {
  it('maps filters to the API query and back', () => {
    const query = toQuery('running', { ...EMPTY_FILTERS, state: 'warn', q: 'x' });
    expect(query).toEqual({ state: 'warn', q: 'x', status: 'RUNNING', ordering: '-usage_pct' });
    expect(filtersFromQuery((k) => (k === 'q' ? 'abc' : null)).q).toBe('abc');
  });

  it('picks the chip that matches the filters', () => {
    expect(activeChip({ ...EMPTY_FILTERS })).toBe('');
    expect(activeChip({ ...EMPTY_FILTERS, no_pm: 'true' })).toBe('no_pm');
    expect(activeChip({ ...EMPTY_FILTERS, over_budget: 'true' })).toBe('at_risk');
    expect(activeChip({ ...EMPTY_FILTERS, state: 'over' })).toBe('over');
  });

  it('composes the insight without zero parts', () => {
    expect(listInsight({ over: 0, warn: 3, no_pm: 0 })).toBe('3 near limit');
    expect(listInsight({ over: 0, warn: 0, no_pm: 0 })).toBe('Every project is within budget.');
  });
});
