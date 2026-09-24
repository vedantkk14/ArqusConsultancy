import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { mockSalesManagerDashboard } from './sales-manager-dashboard.mock';
import { SalesManagerDashboard, Period } from './sales-manager-dashboard.models';
import { SalesManagerDashboardPage } from './sales-manager-dashboard.page';
import { SalesManagerDashboardService } from './sales-manager-dashboard.service';

class FakeService {
  calls: Period[] = [];
  pending = new Subject<SalesManagerDashboard>();
  load(period: Period) {
    this.calls.push(period);
    this.pending = new Subject<SalesManagerDashboard>();
    return this.pending;
  }
}

async function setup() {
  const service = new FakeService();
  const dialog = { open: vi.fn(() => ({ afterClosed: () => of(false) })) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'dashboard', component: SalesManagerDashboardPage, title: 'Team dashboard' }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SalesManagerDashboardService, useValue: service },
      { provide: MatDialog, useValue: dialog },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/dashboard', SalesManagerDashboardPage);
  const el = harness.routeNativeElement as HTMLElement;
  const resolve = (data: SalesManagerDashboard) => {
    service.pending.next(data);
    harness.detectChanges();
  };
  return { harness, el, service, dialog, resolve };
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('SalesManagerDashboardPage', () => {
  it('shows skeletons first, then the team data', async () => {
    const { el, resolve } = await setup();
    expect(el.querySelectorAll('.skeleton-card').length).toBe(6);

    resolve(mockSalesManagerDashboard('month'));
    expect(el.querySelectorAll('.skeleton-card').length).toBe(0);
    expect(el.querySelectorAll('a.kpi').length).toBe(4);
    expect(text(el.querySelector('.kpi .kpi-value'))).toBe('24');
    expect(el.querySelectorAll('app-queue-section').length).toBe(3);
    expect(el.querySelector('app-team-pipeline-card')).toBeNull();
  });

  it('shows the error state and retries on demand', async () => {
    const { el, resolve, service, harness } = await setup();
    service.pending.error({ message: 'boom' });
    harness.detectChanges();
    expect(text(el.querySelector('app-error-state'))).toContain("Couldn't load the team dashboard");

    el.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    harness.detectChanges();
    expect(service.calls.length).toBe(2);
    resolve(mockSalesManagerDashboard('month'));
    expect(el.querySelector('app-error-state')).toBeNull();
  });

  it('opens the assign dialog for an unassigned lead and reloads on success', async () => {
    const { el, resolve, dialog, service, harness } = await setup();
    resolve(mockSalesManagerDashboard('month'));

    dialog.open.mockReturnValueOnce({ afterClosed: () => of(true) } as never);
    const assignBtn = [...el.querySelectorAll('.assign')].find((b) => b.textContent?.trim() === 'Assign');
    (assignBtn as HTMLButtonElement).click();
    harness.detectChanges();

    expect(dialog.open).toHaveBeenCalled();
    expect(service.calls.length).toBe(2); // initial load + reload after a successful assign
  });
});
