import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/models';
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
  },
  trends: { months: DASHBOARD_MOCK.trends.months, leads_new: [0, 0, 0, 0, 0, 0], received: Array(6).fill('0.00') },
  cashflow: { months: DASHBOARD_MOCK.cashflow.months, collected: Array(6).fill('0.00'), spent: Array(6).fill('0.00') },
  attention: [],
  funnel: [],
  sales_by_exec: [],
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

  it('has no hero banner, greeting or workspace tiles', async () => {
    const { el, resolve } = await setup();
    resolve(DASHBOARD_MOCK);
    expect(el.querySelector('.hero')).toBeNull();
    expect(el.querySelector('.tiles')).toBeNull();
    expect(el.textContent).not.toContain('Your workspace');
    expect(el.textContent).not.toMatch(/Good (morning|afternoon|evening)/);
  });

  it('shows skeletons first, then the six KPI cards with the fixture values', async () => {
    const { el, resolve } = await setup();
    expect(el.querySelectorAll('.skeleton-card').length).toBe(7);
    expect(el.querySelector('.k-revenue.card-link')).toBeNull();

    resolve(DASHBOARD_MOCK);
    expect(el.querySelectorAll('.skeleton-card').length).toBe(0);
    expect(el.querySelectorAll('a.kpi').length).toBe(6);
    expect(kpiValues(el)).toEqual(['₹18,45,000', '₹23,10,500', '212', '47', '18', '6', '7', '12']);
    expect(text(el.querySelector('.delta'))).toContain('+12.4%');
    expect(text(el.querySelector('.k-outstanding'))).toContain('across 9 clients');
    expect(text(el.querySelector('.k-outstanding .overdue'))).toContain('₹6,40,000 overdue');
    expect(text(el.querySelector('.k-leads'))).toContain('+31 this month');
    expect(text(el.querySelector('.k-open'))).toContain('₹86.2L proposed value');
    const figs = (sel: string) => [...el.querySelectorAll(`${sel} .fig`)].map((f) => [...f.children].map(text).join(' '));
    expect(figs('.k-won')).toEqual(['18 Won', '6 Lost']);
    expect(text(el.querySelector('.k-won'))).toContain('75% win rate');
    expect(figs('.k-projects')).toEqual(['7 Running', '12 Completed']);
  });

  it('writes a negative delta with a minus sign and hides it when there is no comparison', async () => {
    const { el, resolve } = await setup();
    resolve({ ...DASHBOARD_MOCK, kpis: { ...DASHBOARD_MOCK.kpis, received_delta_pct: '-3.1' } });
    expect(text(el.querySelector('.delta'))).toContain('-3.1%');
    expect(el.querySelector('.delta')!.classList).toContain('neg');

    resolve({ ...DASHBOARD_MOCK, kpis: { ...DASHBOARD_MOCK.kpis, received_delta_pct: null } });
    expect(el.querySelector('.delta')).toBeNull();
  });

  it('renders real zeros as ₹0 and 0, and empty charts say so', async () => {
    const { el, resolve } = await setup();
    resolve(ZEROS);
    expect(kpiValues(el)).toEqual(['₹0', '₹0', '0', '0', '0', '0', '0', '0']);
    expect(text(el.querySelector('.k-won'))).toContain('0% win rate');
    expect(text(el.querySelector('.p-cash'))).toContain('No data for this period');
    expect(text(el.querySelector('app-attention-panel'))).toContain('All clear');
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
    expect(el.querySelectorAll('a.kpi').length).toBe(6);
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
    const { el, service } = await setup(Role.ProjectManager);
    expect(service.calls).toEqual([]);
    expect(text(el)).toContain('Your dashboard is on the way');
  });
});
