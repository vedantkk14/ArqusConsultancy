import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { LeadsApi } from '../data/leads-api.service';
import { filtersFromQuery, toQuery } from '../data/leads-list.store';
import { EMPTY_FILTERS } from '../data/lead.models';
import { FakeLeadsApi, makeLead, page } from '../testing/fake-leads-api';
import { LeadsListPage, listInsight } from './leads-list-page';

@Component({ template: 'lead page' })
class LeadStub {}

async function setup(role: Role = Role.Admin, url = '/leads/all') {
  const api = new FakeLeadsApi();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'leads/all', component: LeadsListPage, data: { mode: 'all' } },
        { path: 'leads/overdue', component: LeadsListPage, data: { mode: 'overdue' } },
        { path: 'leads/won', component: LeadsListPage, data: { mode: 'won' } },
        { path: 'leads/lost', component: LeadsListPage, data: { mode: 'lost' } },
        { path: 'leads/:id', component: LeadStub },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LeadsApi, useValue: api },
    ],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Alice Admin', email: 'a@x.com', role } });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, LeadsListPage);
  const el = harness.routeNativeElement as HTMLElement;
  const resolve = (rows = [makeLead(1), makeLead(2, { status: 'CONTACTED' })], count?: number) => {
    api.pending.next(page(rows, count));
    harness.detectChanges();
  };
  return { api, harness, el, resolve };
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
/** Rows render as a table or as cards depending on width; count the name links instead. */
const rowCount = (el: HTMLElement) => el.querySelectorAll('app-lead-rows a.stretch').length;
const rowBoxes = (el: HTMLElement) => el.querySelectorAll<HTMLInputElement>('app-lead-rows input[type=checkbox][aria-label^="Select Lead"]');
const buttonByText = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).startsWith(label));
/** Buttons whose text also carries an icon name ("download Export as Excel"). */
const buttonWith = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));

describe('LeadsListPage', () => {
  beforeEach(() => localStorage.clear());

  it('reads filters from the URL and sends them with the API names', async () => {
    const { api } = await setup(Role.Admin, '/leads/all?status=NEW&q=rahul&followup=overdue&ordering=name');
    expect(api.listCalls[0]).toMatchObject({ status: 'NEW', q: 'rahul', followup: 'overdue', ordering: 'name', page: 1 });
  });

  it('writes a chip click back to the URL and reloads', async () => {
    const { api, el, resolve, harness } = await setup();
    resolve();
    buttonByText(el, 'Contacted')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/leads/all?status=CONTACTED');
    expect(api.listCalls.at(-1)).toMatchObject({ status: 'CONTACTED' });
  });

  it('shows skeletons, then rows', async () => {
    const { el, resolve } = await setup();
    expect(el.querySelectorAll('app-lead-rows app-skeleton').length).toBeGreaterThan(0);
    resolve();
    expect(rowCount(el)).toBe(2);
    expect(text(el.querySelector('.count'))).toBe('2 leads');
  });

  it('shows an error with retry when the first load fails', async () => {
    const { api, el, harness } = await setup();
    api.pending.error({ status: 500, code: 'server_error', message: 'x', details: {} });
    harness.detectChanges();
    expect(text(el.querySelector('app-error-state'))).toContain("Couldn't load leads");
    el.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    expect(api.listCalls.length).toBe(2);
  });

  it('offers Add lead, selection and Assign only to managers', async () => {
    const admin = await setup(Role.Admin);
    admin.resolve();
    expect(text(admin.el)).toContain('Add lead');
    expect(rowBoxes(admin.el).length).toBe(2);

    TestBed.resetTestingModule();
    const exec = await setup(Role.SalesExec);
    exec.resolve();
    expect(text(exec.el)).not.toContain('Add lead');
    expect(text(exec.el)).not.toContain('Export as Excel');
    expect(rowBoxes(exec.el).length).toBe(0);
  });

  it('shows the bulk bar on selection', async () => {
    const { el, resolve, harness } = await setup();
    resolve();
    rowBoxes(el)[0].click();
    harness.detectChanges();
    expect(text(el.querySelector('.bulk'))).toContain('1 selected');
  });

  it('All leads shows every status by default, most recent first', async () => {
    const { api, el, resolve } = await setup();
    expect(api.listCalls[0]).toEqual({ ordering: '-last_activity_at', page: 1, page_size: 20 });
    expect(api.listCalls[0]).not.toHaveProperty('open');
    resolve([makeLead(1), makeLead(2, { status: 'WON' }), makeLead(3, { status: 'LOST' })]);
    expect(rowCount(el)).toBe(3);
    const chips = [...el.querySelectorAll('.chips .chip')].map((c) => text(c).replace(/\d+$/, '').trim());
    expect(chips).toEqual(['All', 'New', 'Contacted', 'Interested', 'Won', 'Lost']);
    const sort = el.querySelector<HTMLSelectElement>('.sort select')!;
    expect(sort.selectedOptions[0].textContent?.trim()).toBe('Most recent');
    expect([...sort.options].map((o) => o.textContent?.trim())).toContain('Newest first');
  });

  it('an explicit ?open=true (dashboard link) still narrows to open deals', async () => {
    const { api } = await setup(Role.Admin, '/leads/all?open=true');
    expect(api.listCalls[0]).toMatchObject({ open: 'true' });
  });

  it('marks a client with several deals with a "2 deals" badge', async () => {
    const { el, resolve } = await setup();
    resolve([makeLead(1, { deals_count: 2 }), makeLead(2)]);
    const badges = [...el.querySelectorAll('.deals')].map(text);
    expect(badges).toEqual(['2 deals']);
  });

  it('Export as Excel asks for all leads or one month', async () => {
    const { api, el, resolve, harness } = await setup();
    resolve();
    buttonWith(el, 'Export as Excel')!.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    const dialog = document.querySelector('app-export-dialog') as HTMLElement;
    expect(text(dialog)).toContain('All leads');
    expect(text(dialog)).toContain('A specific month');
    buttonByText(dialog, 'Download')!.click();
    await vi.waitFor(() => expect(api.exportCalls.length).toBe(1)); // after the close animation
    expect(api.exportCalls[0].choice).toEqual({ scope: 'all' });

    buttonWith(el, 'Export as Excel')!.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    const again = [...document.querySelectorAll('app-export-dialog')].at(-1) as HTMLElement;
    again.querySelector<HTMLInputElement>('input[value=month]')!.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const month = again.querySelector<HTMLInputElement>('input[type=month]')!;
    expect(month.value).toMatch(/^\d{4}-\d{2}$/);
    month.value = '2026-09';
    month.dispatchEvent(new Event('input'));
    buttonByText(again, 'Download')!.click();
    await vi.waitFor(() => expect(api.exportCalls.length).toBe(2));
    expect(api.exportCalls[1].choice).toEqual({ scope: 'month', month: '2026-09' });
  });

  it('"New project" is disabled with a tooltip while a deal is open, and then opens that deal', async () => {
    const { api, el, resolve, harness } = await setup();
    resolve([makeLead(1, { status: 'CONTACTED' }), makeLead(2, { status: 'WON', allowed_transitions: ['LOST'] })]);
    const openMenu = (i: number) => {
      el.querySelectorAll<HTMLButtonElement>('button[aria-label^="More actions"]')[i].click();
      harness.detectChanges();
      return [...document.querySelectorAll<HTMLButtonElement>('.leads-menu button')].find((b) => text(b).includes('New project'))!;
    };
    const blocked = openMenu(0);
    expect(blocked.classList).toContain('is-off'); // shown disabled, still clickable
    expect(blocked.getAttribute('aria-description')).toContain('This lead already has an open deal');
    blocked.click();
    await harness.fixture.whenStable();
    expect(api.startCalls).toEqual([]);
    expect(TestBed.inject(Router).url).toBe('/leads/1?deal=10');
  });

  it('"New project" on a closed lead opens a form, then starts Deal #2 and opens it', async () => {
    const { api, el, resolve, harness } = await setup(Role.SalesManager);
    resolve([makeLead(2, { status: 'WON', allowed_transitions: ['LOST'] })]);
    el.querySelector<HTMLButtonElement>('button[aria-label^="More actions"]')!.click();
    harness.detectChanges();
    const item = [...document.querySelectorAll<HTMLButtonElement>('.leads-menu button')].find((b) => text(b).includes('New project'))!;
    expect(item.classList).not.toContain('is-off');
    item.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const overlay = document.querySelector('.cdk-overlay-container') as HTMLElement;
    expect(text(overlay)).toContain('New project');
    const requirements = document.getElementById('nd-req') as HTMLTextAreaElement;
    requirements.value = 'Second turf install';
    requirements.dispatchEvent(new Event('input'));
    [...overlay.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).startsWith('Start deal'))!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    await new Promise((r) => setTimeout(r, 300));
    await harness.fixture.whenStable();
    expect(api.startCalls).toEqual([{ id: 2, body: { requirements: 'Second turf install', assigned_to: 7, next_followup_at: null } }]);
    expect(TestBed.inject(Router).url).toBe('/leads/2?deal=99');
  });

  it('a Sales Exec never gets "New project"', async () => {
    const { el, resolve, harness } = await setup(Role.SalesExec);
    resolve([makeLead(2, { status: 'WON', allowed_transitions: [] })]);
    el.querySelector<HTMLButtonElement>('button[aria-label^="More actions"]')!.click();
    harness.detectChanges();
    expect(text(document.querySelector('.leads-menu'))).not.toContain('New project');
  });

  it('Won and Lost have their own lists', async () => {
    const won = await setup(Role.Admin, '/leads/won');
    expect(won.api.listCalls[0]).toMatchObject({ status: 'WON', ordering: '-won_at' });
    TestBed.resetTestingModule();
    const lost = await setup(Role.Admin, '/leads/lost');
    expect(lost.api.listCalls[0]).toMatchObject({ status: 'LOST' });
  });

  it('Won list: Finalize is for Admin and Sales Manager, only while awaiting; the filter goes in the URL', async () => {
    const rows = [
      makeLead(3, { status: 'WON', proposed_amount: '400000.00', won_at: '2026-09-20T06:30:00Z', finalized: false, allowed_transitions: ['LOST'] }),
      makeLead(4, { status: 'WON', proposed_amount: '100000.00', won_at: '2026-09-18T06:30:00Z', finalized: true, allowed_transitions: ['LOST'] }),
    ];
    const admin = await setup(Role.Admin, '/leads/won');
    admin.resolve(rows);
    expect(admin.el.querySelectorAll('button.fin').length).toBe(1);
    expect(text(admin.el)).toContain('Finalized');
    expect(text(admin.el)).toContain('Awaiting');
    buttonByText(admin.el, 'Awaiting finalization')!.click();
    await admin.harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/leads/won?won_awaiting=true');
    expect(admin.api.listCalls.at(-1)).toMatchObject({ status: 'WON', won_awaiting: 'true' });

    TestBed.resetTestingModule();
    const manager = await setup(Role.SalesManager, '/leads/won?won_awaiting=true');
    manager.resolve(rows);
    expect(manager.el.querySelectorAll('button.fin').length).toBe(1);
    expect(text(manager.el)).toContain('Finalized');
    manager.el.querySelector<HTMLButtonElement>('button.fin')!.click();
    manager.harness.detectChanges();
    await manager.harness.fixture.whenStable();
    const dialog = document.querySelector('app-finalize-dialog') as HTMLElement;
    expect(text(dialog)).toContain('Finalize amount');
    expect(text(dialog)).toContain('Lead 3');

    TestBed.resetTestingModule();
    const exec = await setup(Role.SalesExec, '/leads/won');
    exec.resolve(rows.map((r) => ({ ...r, finalized: undefined })));
    expect(text(exec.el)).not.toContain('Finalization');
  });

  it('snoozes optimistically and puts the row back when the save fails', async () => {
    const { api, el, resolve, harness } = await setup(Role.Admin, '/leads/overdue');
    resolve([makeLead(1, { next_followup_at: '2026-09-01T06:30:00Z' }), makeLead(2)]);
    const pageCmp = harness.routeDebugElement!.componentInstance as LeadsListPage;
    api.updateResult = throwError(() => ({ status: 500 }));
    pageCmp.snooze(makeLead(1), '2026-10-01T04:30:00Z');
    harness.detectChanges();
    expect(api.updates).toEqual([{ id: 1, body: { next_followup_at: '2026-10-01T04:30:00Z' } }]);
    expect(rowCount(el)).toBe(2);

    api.updateResult = api.statusResult; // succeeds
    pageCmp.snooze(makeLead(1), '2026-10-01T04:30:00Z');
    harness.detectChanges();
    expect(rowCount(el)).toBe(1);
  });

  it('shows the right empty states', async () => {
    const { el, resolve } = await setup(Role.SalesExec);
    resolve([]);
    expect(text(el)).toContain('No leads assigned yet');

    TestBed.resetTestingModule();
    const filtered = await setup(Role.Admin, '/leads/all?q=zzz');
    filtered.resolve([]);
    expect(text(filtered.el)).toContain('No leads match these filters');
    expect(buttonByText(filtered.el, 'Clear filters')).toBeTruthy();
  });
});

describe('list helpers', () => {
  it('round-trips filters and applies mode presets', () => {
    const f = filtersFromQuery((k) => ({ status: 'WON', q: 'ra' })[k] ?? null);
    expect(f).toEqual({ ...EMPTY_FILTERS, status: 'WON', q: 'ra' });
    expect(toQuery('all', f)).toEqual({ status: 'WON', q: 'ra', ordering: '-last_activity_at' });
    expect(toQuery('won', EMPTY_FILTERS)).toEqual({ status: 'WON', ordering: '-won_at' });
    expect(toQuery('overdue', EMPTY_FILTERS)).toEqual({ followup: 'overdue', ordering: '-last_activity_at' });
  });

  it('composes the insight and skips zero parts', () => {
    expect(listInsight({ overdue: 11, today: 0, untouched: 4 })).toBe(
      '11 follow-ups overdue · 4 new leads not yet contacted',
    );
    expect(listInsight({ overdue: 1, today: 2, untouched: 0 })).toBe('1 follow-up overdue · 2 due today');
    expect(listInsight({ overdue: 0, today: 0, untouched: 0 })).toBe('Nothing overdue. Nice work.');
  });
});
