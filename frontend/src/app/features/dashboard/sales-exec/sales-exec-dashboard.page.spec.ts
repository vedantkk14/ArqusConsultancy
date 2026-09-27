import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { mockSalesExecDashboard } from './sales-exec-dashboard.mock';
import { Period, SalesExecDashboard } from './sales-exec-dashboard.models';
import { SalesExecDashboardPage } from './sales-exec-dashboard.page';
import { SalesExecDashboardService } from './sales-exec-dashboard.service';

class FakeService {
  calls: Period[] = [];
  pending = new Subject<SalesExecDashboard>();
  load(period: Period) {
    this.calls.push(period);
    this.pending = new Subject<SalesExecDashboard>();
    return this.pending;
  }
}

const ZERO_PIPELINE = [
  { status: 'NEW' as const, count: 0 },
  { status: 'CONTACTED' as const, count: 0 },
  { status: 'INTERESTED' as const, count: 0 },
  { status: 'WON' as const, count: 0 },
  { status: 'LOST' as const, count: 0 },
];

async function setup() {
  const service = new FakeService();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'dashboard', component: SalesExecDashboardPage, title: 'Dashboard' }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SalesExecDashboardService, useValue: service },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/dashboard', SalesExecDashboardPage);
  const el = harness.routeNativeElement as HTMLElement;
  const resolve = (data: SalesExecDashboard) => {
    service.pending.next(data);
    harness.detectChanges();
  };
  return { harness, el, service, resolve };
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('SalesExecDashboardPage', () => {
  it('shows skeletons first, then the data', async () => {
    const { el, resolve } = await setup();
    expect(el.querySelectorAll('.skeleton-card').length).toBe(6);

    resolve(mockSalesExecDashboard('month'));
    expect(el.querySelectorAll('.skeleton-card').length).toBe(0);
    expect(el.querySelector('app-follow-up-now-card')).not.toBeNull();
    expect(el.querySelectorAll('app-exec-queue-section').length).toBe(2);
  });

  it('shows the empty state for an exec with no leads at all', async () => {
    const { el, resolve } = await setup();
    resolve({ ...mockSalesExecDashboard('month'), pipeline: ZERO_PIPELINE });
    expect(text(el.querySelector('app-empty-state'))).toContain('No leads assigned yet');
    expect(el.querySelector('.bento')).toBeNull();
  });

  it('hides the "no next step" card entirely when its total is zero', async () => {
    const { el, resolve } = await setup();
    const data = mockSalesExecDashboard('month');
    resolve({ ...data, queues: { ...data.queues, no_followup: { total: 0, items: [] } } });
    const titles = [...el.querySelectorAll('app-exec-queue-section h2')].map((h) => h.textContent?.trim());
    expect(titles).not.toContain('No next step');
  });

  it('shows the error state and retries on demand', async () => {
    const { el, resolve, service, harness } = await setup();
    service.pending.error({ message: 'boom' });
    harness.detectChanges();
    expect(text(el.querySelector('app-error-state'))).toContain("Couldn't load your dashboard");

    el.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    harness.detectChanges();
    expect(service.calls.length).toBe(2);
    resolve(mockSalesExecDashboard('month'));
    expect(el.querySelector('app-error-state')).toBeNull();
  });
});
