import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/models';
import { fakeBreakpoints } from '../../layout/testing/fake-breakpoints';
import { FinancialReportPage } from './financial/financial-report';
import { FunnelReportPage } from './funnel/funnel-report';
import { MarginReportPage, sortByMargin } from './margin/margin-report';
import { MarginRow, monthShort, toReportPeriod } from './reports.models';
import { SalesReportPage } from './sales/sales-report';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const base = { period: 'month', range: { start: '2026-09-01', end: '2026-09-25' } };

async function setup(url: string, component: unknown, width = 1440) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'reports/sales', component: SalesReportPage },
        { path: 'reports/financial-health', component: FinancialReportPage },
        { path: 'reports/project-margin', component: MarginReportPage },
        { path: 'reports/lead-funnel', component: FunnelReportPage },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      fakeBreakpoints(width),
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(AuthService).login('a', 'pw').subscribe();
  http.expectOne('/api/v1/auth/login').flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Al', email: 'a@x.com', role: Role.Admin } });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, component as never);
  return { http, harness, el: harness.routeNativeElement as HTMLElement };
}

const row = (id: number, live: string | null): MarginRow => ({
  id,
  name: `P${id}`,
  pm: 'Pat',
  sanctioned: '100.00',
  spent: '10.00',
  usage_pct: '10.0',
  total: null,
  received: null,
  planned_margin: null,
  live_margin: live,
});

describe('report helpers', () => {
  it('reads periods, months and margin order', () => {
    expect(toReportPeriod('custom')).toBe('custom');
    expect(toReportPeriod('weekly')).toBe('month');
    expect(monthShort('2026-09')).toBe('Sep 26');
    const ids = (desc: boolean) => sortByMargin([row(1, '5'), row(2, null), row(3, '9'), row(4, '-2')], desc).map((r) => r.id);
    expect(ids(true)).toEqual([3, 1, 4, 2]);
    expect(ids(false)).toEqual([4, 1, 3, 2]);
  });
});

describe('SalesReportPage', () => {
  const report = {
    ...base,
    data_sources: { leads: true },
    rows: [
      { user_id: 2, name: 'Eva', leads_worked: 4, won: 2, lost: 1, conversion_pct: '66.7', won_value: '1500.50', commission_rate: '10.00', commission: '150.05' },
    ],
    totals: { leads_worked: 4, won: 2, lost: 1, conversion_pct: '66.7', won_value: '1500.50', commission: '150.05' },
  };

  it('sends the period from the URL and shows rows with a team total', async () => {
    const { http, harness, el } = await setup('/reports/sales?period=quarter', SalesReportPage);
    const req = http.expectOne((r) => r.url === '/api/v1/reports/sales');
    expect(req.request.params.get('period')).toBe('quarter');
    req.flush(report);
    harness.detectChanges();
    expect(text(el.querySelector('tbody tr'))).toContain('Eva');
    expect(text(el.querySelector('tbody tr'))).toContain('66.7%');
    expect(text(el.querySelector('tfoot'))).toContain('Team');
    expect(el.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe('Quarter');
  });

  it('writes a period change to the URL and downloads CSV from the same params', async () => {
    const { http, harness, el } = await setup('/reports/sales', SalesReportPage);
    http.expectOne((r) => r.url === '/api/v1/reports/sales').flush(report);
    harness.detectChanges();
    [...el.querySelectorAll<HTMLButtonElement>('.seg button')].find((b) => text(b) === 'Year')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/reports/sales?period=year');
    http.expectOne((r) => r.params.get('period') === 'year').flush(report);
    harness.detectChanges();
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => undefined;
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes('Export CSV'))!.click();
    const csv = http.expectOne((r) => r.params.get('export') === 'csv');
    expect(csv.request.params.get('period')).toBe('year');
    expect(csv.request.responseType).toBe('blob');
    csv.flush(new Blob(['a']));
  });

  it('waits for both dates on a custom period', async () => {
    const { http, harness, el } = await setup('/reports/sales?period=custom&from=2026-09-01', SalesReportPage);
    http.expectNone((r) => r.url === '/api/v1/reports/sales');
    expect(text(el)).toContain('Choose a start and end date');
    await harness.navigateByUrl('/reports/sales?period=custom&from=2026-09-01&to=2026-09-20');
    http.expectOne((r) => r.params.get('to') === '2026-09-20').flush(report);
  });

  it('shows an error state with retry', async () => {
    const { http, harness, el } = await setup('/reports/sales', SalesReportPage);
    http.expectOne((r) => r.url === '/api/v1/reports/sales').flush({ error: { code: 'x', message: 'no' } }, { status: 500, statusText: 'x' });
    harness.detectChanges();
    expect(text(el)).toContain("Couldn't load sales");
  });
});

describe('other reports', () => {
  it('financial shows the pending note and an empty aging table without errors', async () => {
    const { http, harness, el } = await setup('/reports/financial-health', FinancialReportPage);
    http.expectOne((r) => r.url === '/api/v1/reports/financial').flush({
      ...base,
      data_sources: { accounts: false },
      note: 'Financial figures pending accounts integration.',
      months: ['2026-08', '2026-09'],
      received: ['0.00', '0.00'],
      spent: ['0.00', '0.00'],
      totals: { received: '0.00', spent: '0.00', net: '0.00', outstanding: '0.00', collection_rate_pct: '0.0' },
      aging: [{ bucket: '0-30', count: 0, amount: '0.00' }],
      top_outstanding_clients: [],
    });
    harness.detectChanges();
    expect(text(el)).toContain('Financial figures pending accounts integration.');
    expect(text(el)).toContain('Nobody owes anything right now.');
  });

  it('margin shows an empty state, and sortable rows on desktop', async () => {
    const { http, harness, el } = await setup('/reports/project-margin', MarginReportPage);
    http.expectOne((r) => r.url === '/api/v1/reports/project-margin').flush({ ...base, data_sources: {}, note: 'n', rows: [row(1, '5.00'), row(2, '9.00')] });
    harness.detectChanges();
    expect(text(el.querySelector('tbody tr'))).toContain('P2');
    el.querySelector<HTMLButtonElement>('th button')!.click();
    harness.detectChanges();
    expect(text(el.querySelector('tbody tr'))).toContain('P1');
  });

  it('funnel lists stages and sources', async () => {
    const { http, harness, el } = await setup('/reports/lead-funnel', FunnelReportPage);
    http.expectOne((r) => r.url === '/api/v1/reports/lead-funnel').flush({
      ...base,
      data_sources: { leads: true },
      stages: [
        { status: 'NEW', label: 'New', count: 4, value: '10.00', reached: 6, conversion_pct: null },
        { status: 'WON', label: 'Won', count: 2, value: '30.00', reached: 2, conversion_pct: '33.3' },
      ],
      lost: { count: 1, value: '5.00' },
      sources: [{ source: 'WEBSITE', label: 'Website', leads: 7, won: 2, conversion_pct: '28.6', value: '45.00' }],
    });
    harness.detectChanges();
    expect(text(el.querySelector('app-funnel-card'))).toContain('New');
    expect(el.querySelector('app-funnel-card a.va')).toBeNull();
    expect(text(el.querySelector('[aria-label="Lead sources"]'))).toContain('Website');
    expect(text(el.querySelector('[aria-label="Stage conversion"]'))).toContain('33.3%');
  });
});
