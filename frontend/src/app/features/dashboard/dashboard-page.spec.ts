import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/models';
import { LayoutService } from '../../layout/layout.service';
import { DashboardPage } from './dashboard-page';
import { DASHBOARD_MOCK } from './dashboard.mock';
import { AdminDashboard, Period } from './dashboard.models';
import { DashboardService } from './dashboard.service';

/** Fake service: each call returns a Subject the test resolves or fails. */
class FakeDashboardService {
  calls: Period[] = [];
  pending = new Subject<AdminDashboard>();
  loadAdmin(period: Period) {
    this.calls.push(period);
    this.pending = new Subject<AdminDashboard>();
    return this.pending;
  }
}

const ZEROS: AdminDashboard = {
  ...DASHBOARD_MOCK,
  kpis: {
    received: '0.00',
    received_prev: '0.00',
    received_delta_pct: null,
    outstanding: '0.00',
    outstanding_clients: 0,
    outstanding_overdue: '0.00',
    leads_total: 0,
    leads_new: 0,
    leads_new_prev: 0,
    open_count: 0,
    open_value: '0.00',
    won_count: 0,
    lost_count: 0,
    win_rate_pct: '0.0',
    projects_running: 0,
    projects_completed: 0,
    spent: '0.00',
    net: '0.00',
    net_margin_pct: '0.0',
    collection_rate_pct: '0.0',
  },
  trends: { months: DASHBOARD_MOCK.trends.months, leads_new: [0, 0, 0, 0, 0, 0], received: Array(6).fill('0.00') },
  cashflow: {
    months: DASHBOARD_MOCK.cashflow.months,
    collected: Array(6).fill('0.00'),
    spent: Array(6).fill('0.00'),
    net: Array(6).fill('0.00'),
  },
  attention: [],
  funnel: [],
  sales_by_exec: [],
  lead_sources: [],
  collections_aging: DASHBOARD_MOCK.collections_aging.map((b) => ({ ...b, count: 0, amount: '0.00' })),
  top_overdue_clients: [],
  projects_burn: [],
  recent: { payments: [], expenses: [], activity: [] },
};

async function setup(role = Role.Admin, url = '/dashboard') {
  const service = new FakeDashboardService();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'dashboard', component: DashboardPage, title: 'Dashboard' }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: DashboardService, useValue: service },
    ],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Alice Admin', email: 'a@x.com', role } });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, DashboardPage);
  const el = harness.routeNativeElement as HTMLElement;
  const resolve = (data: AdminDashboard) => {
    service.pending.next(data);
    harness.detectChanges();
  };
  return { harness, el, service, resolve };
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const kpiValues = (el: HTMLElement) => [...el.querySelectorAll('.kpi-value')].map(text);

describe('DashboardPage', () => {
  beforeEach(() => localStorage.clear());

  it('has no greeting or workspace tiles', async () => {
    const { el, resolve } = await setup();
    resolve(DASHBOARD_MOCK);
    expect(el.querySelector('.tiles')).toBeNull();
    expect(el.textContent).not.toContain('Your workspace');
    expect(el.textContent).not.toMatch(/Good (morning|afternoon|evening)/);
  });

  it('shows skeletons first, then the bento with the fixture values', async () => {
    const { el, resolve } = await setup();
    expect(el.querySelectorAll('.skeleton-card').length).toBe(7);
    expect(el.querySelector('app-cash-hero')).toBeNull();

    resolve(DASHBOARD_MOCK);
    expect(el.querySelectorAll('.skeleton-card').length).toBe(0);
    expect(el.querySelectorAll('a.kpi').length).toBe(4);
    expect(kpiValues(el)).toEqual(['₹23,10,500', '212', '47']);
    expect(text(el.querySelector('app-cash-hero .big'))).toBe('₹18,45,000');
    expect(text(el.querySelector('app-cash-hero .delta'))).toBe('+12.4%');
    expect(text(el.querySelector('.pill.overdue'))).toContain('overdue');
    expect([...el.querySelectorAll('.wl > span')].map(text)).toEqual(['18 Won', '6 Lost']);
    expect(el.querySelector('app-radial-gauge')!.getAttribute('aria-label')).toBe('62.4% collection rate');
    expect(text(el.querySelector('.create'))).toContain('Create account');
    expect(el.querySelectorAll('app-projects-card li a').length).toBe(5);
    expect(text(el.querySelector('app-projects-card'))).toContain('Over budget');
    expect(el.querySelectorAll('app-activity-card li').length).toBe(8);
  });

  it('hero tabs switch the value and the chart series', async () => {
    const { el, resolve, harness } = await setup();
    resolve(DASHBOARD_MOCK);
    const line = () => el.querySelector('app-cash-hero path.line')!.getAttribute('d');
    const tab = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('app-cash-hero [role=tab]')].find((b) => text(b) === label)!;
    const receivedLine = line();

    tab('Spent').click();
    harness.detectChanges();
    expect(tab('Spent').getAttribute('aria-selected')).toBe('true');
    expect(text(el.querySelector('app-cash-hero .big'))).toBe('₹9,40,000');
    expect(el.querySelector('app-cash-hero .delta')).toBeNull();
    expect(line()).not.toBe(receivedLine);

    tab('Net').click();
    harness.detectChanges();
    expect(text(el.querySelector('app-cash-hero .big'))).toBe('₹9,05,000');
  });

  it('writes a negative delta with a minus sign and hides it when there is no comparison', async () => {
    const { el, resolve } = await setup();
    resolve({ ...DASHBOARD_MOCK, kpis: { ...DASHBOARD_MOCK.kpis, received_delta_pct: '-3.1' } });
    expect(text(el.querySelector('app-cash-hero .delta'))).toBe('-3.1%');

    resolve({ ...DASHBOARD_MOCK, kpis: { ...DASHBOARD_MOCK.kpis, received_delta_pct: null } });
    expect(el.querySelector('app-cash-hero .delta')).toBeNull();
  });

  it('renders real zeros, empty charts say so and nothing is waiting', async () => {
    const { el, resolve } = await setup();
    resolve(ZEROS);
    expect(kpiValues(el)).toEqual(['₹0', '0', '0']);
    expect(text(el.querySelector('app-cash-hero .big'))).toBe('₹0');
    expect(text(el.querySelector('app-cash-hero'))).toContain('No data for this period');
    expect(text(el.querySelector('app-attention-panel'))).toContain('Nothing is waiting on you.');
  });

  it('offers the "+ New" actions with their routes', async () => {
    const { el, resolve, harness } = await setup();
    resolve(DASHBOARD_MOCK);
    el.querySelector<HTMLButtonElement>('app-new-menu button')!.click();
    harness.detectChanges();
    const items = [...document.querySelectorAll<HTMLAnchorElement>('.flyout a')];
    expect(items.map((a) => text(a).replace(/^[a-z_]+/, ''))).toEqual([
      'Add lead',
      'Record payment',
      'Convert won lead',
    ]);
    expect(items.map((a) => a.getAttribute('href'))).toEqual([
      '/leads/new',
      '/accounts/payments',
      '/projects/convert',
    ]);
  });

  it('sets sidebar badges from the attention counts', async () => {
    const { resolve } = await setup();
    resolve(DASHBOARD_MOCK);
    TestBed.tick();
    expect(TestBed.inject(LayoutService).navBadges()).toEqual({
      '/leads': { count: 11, tone: 'rose' },
      '/accounts': { count: 4, tone: 'rose' },
      '/projects': { count: 2, tone: 'amber' },
    });
  });

  it('shows an error with a retry that loads again', async () => {
    const { el, service, resolve, harness } = await setup();
    service.pending.error(new Error('boom'));
    harness.detectChanges();
    expect(text(el.querySelector('app-error-state'))).toContain("Couldn't load the dashboard");

    el.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    harness.detectChanges();
    expect(service.calls.length).toBe(2);
    expect(el.querySelectorAll('.skeleton-card').length).toBe(7);
    resolve(DASHBOARD_MOCK);
    expect(el.querySelectorAll('a.kpi').length).toBe(4);
  });

  it('keeps the period in the URL and loads it', async () => {
    const { el, service, harness } = await setup(Role.Admin, '/dashboard?period=year');
    expect(service.calls).toEqual(['year']);
    const pressed = () => text(el.querySelector('app-period-switcher [aria-pressed="true"]'));
    expect(pressed()).toBe('Year');

    [...el.querySelectorAll<HTMLButtonElement>('app-period-switcher button')].find((b) => text(b) === 'Quarter')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/dashboard?period=quarter');
    expect(service.calls).toEqual(['year', 'quarter']);
    expect(pressed()).toBe('Quarter');
  });

  it('does not call the admin endpoint for other roles', async () => {
    const { el, service } = await setup(Role.SalesExec);
    expect(service.calls).toEqual([]);
    expect(text(el)).toContain('Hi Alice, your dashboard is on the way');
  });
});
