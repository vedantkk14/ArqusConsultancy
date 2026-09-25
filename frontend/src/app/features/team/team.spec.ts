import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/models';
import { fakeBreakpoints } from '../../layout/testing/fake-breakpoints';
import { AssignmentsPage } from './assignments/assignments-page';
import { CommissionPage } from './commission/commission-page';
import { TeamUser, isValidRate } from './team.models';
import { EditUserDialog } from './users/edit-user-dialog';
import { ResetPasswordDialog } from './users/reset-password-dialog';
import { UsersPage } from './users/users-page';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const user = (id: number, patch: Partial<TeamUser> = {}): TeamUser => ({
  id,
  username: `u${id}`,
  name: `User ${id}`,
  first_name: 'User',
  last_name: String(id),
  email: `u${id}@crm.local`,
  phone: '',
  role: Role.SalesExec,
  is_active: true,
  must_change_password: false,
  commission_rate: '2.50',
  last_login: null,
  date_joined: '2026-09-01T00:00:00Z',
  ...patch,
});
const page = (results: TeamUser[]) => ({ count: results.length, next: null, previous: null, results });

async function signIn(role = Role.Admin, id = 1) {
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(AuthService).login('a', 'pw').subscribe();
  http.expectOne('/api/v1/auth/login').flush({
    access: 'A',
    refresh: 'R',
    user: { id, name: 'Alice Admin', email: 'a@x.com', role },
  });
  return http;
}

function configure(extra: unknown[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'team/users', component: UsersPage },
        { path: 'team/commission-rates', component: CommissionPage },
        { path: 'team/assignments', component: AssignmentsPage },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      fakeBreakpoints(1440),
      ...extra,
    ],
  });
}

describe('isValidRate', () => {
  it('accepts 0 to 100 with up to two decimals only', () => {
    for (const ok of ['0', '2.5', '12.50', '100', '99.99', '0.01']) expect(isValidRate(ok)).toBe(true);
    for (const bad of ['', '-1', '100.01', '2.555', 'abc', '1e2', '101', ' ']) expect(isValidRate(bad)).toBe(false);
  });
});

describe('UsersPage', () => {
  async function open(url = '/team/users', role = Role.Admin) {
    configure();
    const http = await signIn(role);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, UsersPage);
    const flush = (rows: TeamUser[]) => {
      http.expectOne((r) => r.url === '/api/v1/users').flush(page(rows));
      harness.detectChanges();
    };
    return { http, harness, el: harness.routeNativeElement as HTMLElement, flush };
  }

  it('reads filters from the URL, lists users with role and status, and marks you', async () => {
    const { http, el, harness } = await open('/team/users?role=SALES_EXEC&is_active=true&q=eva');
    const req = http.expectOne((r) => r.url === '/api/v1/users');
    expect(req.request.params.get('role')).toBe('SALES_EXEC');
    expect(req.request.params.get('is_active')).toBe('true');
    expect(req.request.params.get('q')).toBe('eva');
    req.flush(page([user(1, { role: Role.Admin, commission_rate: null }), user(2), user(3, { is_active: false })]));
    harness.detectChanges();
    const rows = [...el.querySelectorAll('app-users-page tbody tr, tbody tr')];
    expect(rows.length).toBe(3);
    expect(text(rows[0])).toContain('User 1 (you)');
    expect(text(rows[1])).toContain('Sales Executive');
    expect(text(rows[1])).toContain('2.50%');
    expect(text(rows[2])).toContain('Inactive');
    expect(text(rows[0])).toContain('—');
  });

  it('writes a role filter back to the URL', async () => {
    const { el, flush, harness } = await open();
    flush([user(2)]);
    const select = el.querySelectorAll<HTMLSelectElement>('select.ctl')[0];
    select.value = 'PROJECT_MANAGER';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/team/users?role=PROJECT_MANAGER');
  });

  it('shows empty and error states', async () => {
    const empty = await open();
    empty.flush([]);
    expect(text(empty.el)).toContain('No users yet');
    TestBed.resetTestingModule();
    configure();
    await signIn();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/team/users', UsersPage);
    TestBed.inject(HttpTestingController).expectOne((r) => r.url === '/api/v1/users').flush({}, { status: 500, statusText: 'x' });
    harness.detectChanges();
    expect(text(harness.routeNativeElement)).toContain("Couldn't load users");
  });

  it('offers Deactivate for others but never for yourself, and confirms first', async () => {
    const { http, el, flush, harness } = await open();
    flush([user(1, { role: Role.Admin }), user(2)]);
    const menuFor = (name: string) => {
      el.querySelector<HTMLButtonElement>(`button[aria-label="Actions for ${name}"]`)!.click();
      harness.detectChanges();
      return [...document.querySelectorAll('.mat-mdc-menu-item')].map(text);
    };
    expect(menuFor('User 1').some((t) => /Deactivate/.test(t))).toBe(false);
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => (n.innerHTML = ''));
    const items = menuFor('User 2');
    expect(items.some((t) => /Deactivate/.test(t))).toBe(true);
    expect(items.some((t) => /Reset password/.test(t))).toBe(true);

    const dialog = TestBed.inject(MatDialog);
    vi.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => of(true) } as never);
    [...document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item')].find((b) => /Deactivate/.test(text(b)))!.click();
    http.expectOne('/api/v1/users/2/deactivate').flush(user(2, { is_active: false }));
    harness.detectChanges();
    expect(text(el)).toContain('Inactive');
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => (n.innerHTML = ''));
  });
});

describe('EditUserDialog', () => {
  function edit(u: TeamUser, isSelf = false) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { user: u, isSelf } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(EditUserDialog);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, close, http: TestBed.inject(HttpTestingController) };
  }

  it('shows the commission rate only while the role is Sales Executive', () => {
    const { fixture, el } = edit(user(2));
    expect(el.querySelector('#eu-rate')).not.toBeNull();
    const select = el.querySelector<HTMLSelectElement>('#eu-role')!;
    select.value = 'PROJECT_MANAGER';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('#eu-rate')).toBeNull();
    select.value = 'SALES_EXEC';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('#eu-rate')).not.toBeNull();
  });

  it('saves the profile and then the rate when it changed', () => {
    const { fixture, el, http, close } = edit(user(2));
    const rate = el.querySelector<HTMLInputElement>('#eu-rate')!;
    rate.value = '3.75';
    rate.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
    const patch = http.expectOne('/api/v1/users/2');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toMatchObject({ first_name: 'User', role: 'SALES_EXEC' });
    patch.flush(user(2));
    const rateReq = http.expectOne('/api/v1/users/2/commission-rate');
    expect(rateReq.request.body).toEqual({ commission_rate: '3.75' });
    rateReq.flush(user(2, { commission_rate: '3.75' }));
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ commission_rate: '3.75' }));
  });

  it('rejects a bad rate without calling the API, and fixes your own role', () => {
    const { fixture, el, http } = edit(user(2), true);
    expect(el.querySelector<HTMLSelectElement>('#eu-role')!.disabled).toBe(true);
    const rate = el.querySelector<HTMLInputElement>('#eu-rate')!;
    rate.value = '150';
    rate.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
    http.expectNone('/api/v1/users/2');
    expect(text(el)).toContain('Enter 0 to 100');
    expect(text(el)).toContain("You can't change your own role.");
  });
});

describe('ResetPasswordDialog', () => {
  it('asks first, then shows the temporary password once with a warning', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { user: user(2) } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(ResetPasswordDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    expect(text(el)).toContain('Reset password?');
    expect(el.querySelector('[data-testid=temp-password]')).toBeNull();

    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Reset password')!.click();
    http.expectOne('/api/v1/users/2/reset-password').flush({ temporary_password: 'Ab3#kPq9mZx2Wd', must_change_password: true });
    fixture.detectChanges();
    expect(text(el.querySelector('[data-testid=temp-password]'))).toBe('Ab3#kPq9mZx2Wd');
    expect(text(el)).toContain("won't be shown again");
    expect(text(el)).toContain('Copy password');
  });
});

describe('CommissionPage', () => {
  it('lists executives only and validates before saving a row', async () => {
    configure();
    const http = await signIn();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/team/commission-rates', CommissionPage);
    const el = harness.routeNativeElement as HTMLElement;
    const req = http.expectOne((r) => r.url === '/api/v1/users');
    expect(req.request.params.get('role')).toBe('SALES_EXEC');
    req.flush(page([user(2), user(3, { commission_rate: '1.00' })]));
    harness.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(2);

    el.querySelector<HTMLButtonElement>('button.link')!.click();
    harness.detectChanges();
    const input = el.querySelector<HTMLInputElement>('input.rate')!;
    input.value = '101';
    input.dispatchEvent(new Event('input'));
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Save')!.click();
    harness.detectChanges();
    http.expectNone('/api/v1/users/2/commission-rate');
    expect(text(el)).toContain('Enter 0 to 100');

    input.value = '4.5';
    input.dispatchEvent(new Event('input'));
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Save')!.click();
    const save = http.expectOne('/api/v1/users/2/commission-rate');
    expect(save.request.body).toEqual({ commission_rate: '4.5' });
    save.flush(user(2, { commission_rate: '4.50' }));
    harness.detectChanges();
    expect(text(el.querySelector('tbody tr'))).toContain('4.50%');
    expect(el.querySelector('input.rate')).toBeNull();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => (n.innerHTML = ''));
  });
});

describe('AssignmentsPage', () => {
  const overview = {
    data_sources: { leads: true, projects: false },
    execs: [{ id: 5, name: 'Eva Exec', open_leads: 8, overdue: 3 }],
    pms: [{ id: 6, name: 'Paul Project', running_projects: 0, over_budget: 0 }],
  };

  it('links each row into the filtered list and explains missing project data', async () => {
    configure();
    const http = await signIn(Role.Admin);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/team/assignments', AssignmentsPage);
    http.expectOne('/api/v1/users/assignments-overview').flush(overview);
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/leads/all?assigned_to=5');
    expect(hrefs).toContain('/leads/overdue?assigned_to=5');
    expect(text(el)).toContain('3 overdue');
    expect(text(el)).toContain('Project counts appear once the projects module is connected.');
    expect(text(el)).not.toContain('Read-only view.');
  });

  it('shows the Sales Manager their executives only, each linking to their details', async () => {
    configure();
    const http = await signIn(Role.SalesManager);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/team/assignments', AssignmentsPage);
    http.expectOne('/api/v1/users/assignments-overview').flush(overview);
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el)).toContain('Your sales executives');
    expect(text(el)).not.toContain('Project managers');
    expect(el.querySelector('a.nm')!.getAttribute('href')).toMatch(/^\/team\/members\/\d+$/);
  });
});

describe('MemberPage', () => {
  const perf = {
    user: { id: 5, name: 'Eva Exec', username: 'eva', email: 'e@x.com', phone: '', role: Role.SalesExec, is_active: true, date_joined: '2026-01-01T00:00:00Z', last_login: null, commission_rate: '10.00' },
    leads: {
      assigned: 4, open: 1, won: 2, lost: 1, conversion_pct: '66.7', won_value: '1500.00', open_value: '200.00', overdue_followups: 1,
      won_this_month: 2, leads_created: 0, commission_earned: '150.00', lost_reasons: [{ reason: 'Price', count: 1 }],
      recent_closed: [{ id: 9, name: 'Acme', status: 'WON', value: '1000.00', when: '2026-09-20T00:00:00Z' }],
    },
    projects: null,
  };

  it('shows details and sales results for the member in the URL', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'team/members/:id', loadComponent: () => import('./member/member-page').then((m) => m.MemberPage) }]), provideHttpClient(), provideHttpClientTesting(), fakeBreakpoints(1440)],
    });
    const http = await signIn(Role.SalesManager, 2);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/team/members/5');
    http.expectOne('/api/v1/users/5/performance').flush(perf);
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el)).toContain('Eva Exec');
    expect(text(el)).toContain('66.7%');
    expect(text(el)).toContain('Price');
    expect(text(el)).not.toContain('Project delivery');
    expect(el.querySelector('a.back')!.getAttribute('href')).toBe('/team/assignments');
  });
});
