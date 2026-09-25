import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { fakeViewport } from '../../projects/testing/fake-viewport';
import { DashboardPage } from '../dashboard-page';
import { emptyPmDashboard, mockPmDashboard } from './pm-dashboard.mock';
import { PmDashboard } from './pm-dashboard.models';
import { PmDashboardService } from './pm-dashboard.service';

class FakeService {
  calls = 0;
  pending = new Subject<PmDashboard>();
  load() {
    this.calls++;
    this.pending = new Subject<PmDashboard>();
    return this.pending;
  }
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function setup(width = 1440) {
  const service = new FakeService();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'dashboard', component: DashboardPage, title: 'Dashboard' }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      fakeViewport(width),
      { provide: PmDashboardService, useValue: service },
    ],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({
      access: 'A',
      refresh: 'R',
      user: { id: 5, name: 'Priya Manager', email: 'p@x.com', role: Role.ProjectManager },
    });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/dashboard', DashboardPage);
  const el = harness.routeNativeElement as HTMLElement;
  const resolve = (data: PmDashboard) => {
    service.pending.next(data);
    harness.detectChanges();
  };
  return { harness, el, service, resolve };
}

describe('PmDashboardPage', () => {
  beforeEach(() => localStorage.clear());

  it('is what a PROJECT_MANAGER sees on /dashboard: skeleton, then data', async () => {
    const { el, resolve } = await setup();
    expect(el.querySelector('app-pm-dashboard')).not.toBeNull();
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    resolve(mockPmDashboard());
    expect(el.querySelector('[aria-busy="true"]')).toBeNull();
    expect(el.querySelectorAll('app-pm-project-card').length).toBe(3);
    expect(text(el.querySelector('.insight'))).toBe(
      '1 project near its limit · 1 expense logged today',
    );
  });

  it('shows an error with retry, and retry reloads', async () => {
    const { el, service, harness } = await setup();
    service.pending.error(new Error('boom'));
    harness.detectChanges();
    expect(el.querySelector('app-error-state')).not.toBeNull();
    (el.querySelector('app-error-state button') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(service.calls).toBe(2);
  });

  it('hides the alerts section when there are none, and shows it worst-first otherwise', async () => {
    const { el, resolve } = await setup();
    resolve(mockPmDashboard());
    expect(el.querySelectorAll('app-pm-alert-row').length).toBe(1);
    expect(text(el.querySelector('app-pm-alert-row'))).toContain('Near limit');
    resolve({ ...mockPmDashboard(), alerts: [] });
    expect(el.querySelector('.alerts')).toBeNull();
  });

  it('shows the empty state for a PM with no projects', async () => {
    const { el, resolve } = await setup();
    resolve(emptyPmDashboard());
    const empty = text(el.querySelector('app-empty-state'));
    expect(empty).toContain('No projects assigned yet');
    expect(empty).toContain('Your admin will assign you a project to get started.');
    expect(el.querySelector('.create')).toBeNull();
  });

  it('receipt icons follow has_receipt, and voided rows carry a Void tag', async () => {
    const { el, resolve } = await setup();
    resolve(mockPmDashboard());
    const rows = [...el.querySelectorAll('app-pm-expense-row')];
    expect(rows.map((r) => r.querySelector('.rc')!.classList.contains('on'))).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(rows.map((r) => !!r.querySelector('.void-tag'))).toEqual([false, false, true, false]);
    expect(text(rows[1])).toContain('No receipt');
    expect(text(rows[0])).toContain('Receipt attached');
  });

  it('the completion event reads correctly in recent activity', async () => {
    const { el, resolve } = await setup();
    resolve(mockPmDashboard());
    expect(text(el.querySelector('app-pm-activity-list'))).toContain('Project marked Completed');
  });

  it('quick add opens the form directly with one running project, a picker with several', async () => {
    const { el, resolve, harness } = await setup();
    const dialog = TestBed.inject(MatDialog);
    const open = vi.spyOn(dialog, 'open');
    const one = mockPmDashboard();
    one.projects = [one.projects[0]];
    resolve(one);
    (el.querySelector('.create') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(document.querySelector('app-add-expense-form')).not.toBeNull();
    expect(document.querySelector('.proj-pick')).toBeNull();
    const forms = document.querySelectorAll('app-add-expense-form').length;
    dialog.closeAll();

    resolve(mockPmDashboard());
    (el.querySelector('.create') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(document.querySelector('.proj-pick')).not.toBeNull();
    expect(document.querySelectorAll('.proj-pick li').length).toBe(2);
    expect(document.querySelectorAll('app-add-expense-form').length).toBe(forms);
    expect(open).toHaveBeenCalledTimes(2);
    dialog.closeAll();
  });

  it('never renders finance or lead words for a PM', async () => {
    const { el, resolve } = await setup();
    resolve(mockPmDashboard());
    expect(text(el).toLowerCase()).not.toMatch(/total|received|outstanding|margin|proposed|ledger/);
  });

  it('phone layout: a floating add button whose name includes the project when there is one', async () => {
    const { el, resolve } = await setup(390);
    const one = mockPmDashboard();
    one.projects = [one.projects[0]];
    resolve(one);
    expect(el.querySelector('.create')).toBeNull();
    expect(el.querySelector('.fab')!.getAttribute('aria-label')).toBe(
      'Add expense to Riverside Court Renovation',
    );
  });
});

describe('PROJECT_MANAGER navigation', () => {
  it('sees only the audited item set', async () => {
    const { SIDEBAR_CONFIG, filterNavByRole } = await import('../../../core/config/sidebar.config');
    const routes = filterNavByRole(SIDEBAR_CONFIG, Role.ProjectManager).flatMap((i) =>
      (i.children?.length ? i.children : [i]).map((c) => c.route),
    );
    expect(routes).toEqual([
      '/dashboard',
      '/projects/running',
      '/projects/completed',
      '/expenses/all',
      '/communication/notifications',
      '/settings/profile',
    ]);
  });
});
