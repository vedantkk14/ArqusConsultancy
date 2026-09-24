import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/models';
import { fakeBreakpoints } from '../../layout/testing/fake-breakpoints';
import { AuditLogPage } from './audit-log/audit-log-page';
import { ProfilePage } from './profile/profile-page';
import { fieldLabel, modelName, showValue } from './settings.models';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const empty = { count: 0, next: null, previous: null, results: [] };

async function setup(url: string, component: unknown, width = 1440) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'settings/audit-log', component: AuditLogPage },
        { path: 'settings/profile', component: ProfilePage },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      fakeBreakpoints(width),
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(AuthService).login('a', 'pw').subscribe();
  http.expectOne('/api/v1/auth/login').flush({
    access: 'A',
    refresh: 'R',
    user: { id: 1, name: 'Alice Admin', email: 'a@x.com', role: Role.Admin },
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, component as never);
  return { http, harness, el: harness.routeNativeElement as HTMLElement };
}

describe('settings helpers', () => {
  it('formats model, field and value text', () => {
    expect(modelName('leads.Lead')).toBe('Lead');
    expect(fieldLabel('assigned_to_id')).toBe('Assigned to');
    expect(showValue(null)).toBe('—');
    expect(showValue('')).toBe('—');
    expect(showValue(0)).toBe('0');
  });
});

describe('AuditLogPage', () => {
  const entry = {
    id: 1,
    actor: { id: 2, name: 'Sam' },
    action: 'UPDATE',
    model_label: 'leads.Lead',
    object_id: '9',
    object_repr: 'Acme',
    changes: { status: { old: 'NEW', new: 'WON' } },
    created_at: '2026-09-20T05:00:00Z',
  };

  async function open(url: string, width = 1440) {
    const ctx = await setup(url, AuditLogPage, width);
    ctx.http.expectOne('/api/v1/core/audit-log/models').flush(['leads.Lead']);
    ctx.http.expectOne((r) => r.url === '/api/v1/users').flush(empty);
    return ctx;
  }

  it('sends URL filters, lists entries and expands a before/after diff', async () => {
    const { http, harness, el } = await open('/settings/audit-log?model_label=leads.Lead&action=UPDATE');
    const req = http.expectOne((r) => r.url === '/api/v1/core/audit-log');
    expect(req.request.params.get('model_label')).toBe('leads.Lead');
    expect(req.request.params.get('action')).toBe('UPDATE');
    req.flush({ ...empty, count: 1, results: [entry] });
    harness.detectChanges();
    expect(text(el.querySelector('tbody tr'))).toContain('Sam');
    expect(text(el.querySelector('tbody tr'))).toContain('Acme');
    el.querySelector<HTMLButtonElement>('.view')!.click();
    harness.detectChanges();
    expect(text(el.querySelector('.diff'))).toContain('StatusNEW');
    expect(text(el.querySelector('.diff .n'))).toBe('WON');
  });

  it('shows the empty state, and cards on a phone', async () => {
    const { http, harness, el } = await open('/settings/audit-log', 390);
    http.expectOne((r) => r.url === '/api/v1/core/audit-log').flush(empty);
    harness.detectChanges();
    expect(text(el)).toContain('No activity yet.');
    expect(el.querySelector('table')).toBeNull();
  });

  it('writes a filter back to the URL', async () => {
    const { http, harness, el } = await open('/settings/audit-log');
    http.expectOne((r) => r.url === '/api/v1/core/audit-log').flush(empty);
    harness.detectChanges();
    const select = el.querySelectorAll<HTMLSelectElement>('select.ctl')[2];
    select.value = 'DELETE';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/settings/audit-log?action=DELETE');
  });
});

describe('ProfilePage', () => {
  const profile = {
    id: 1,
    name: 'Eva Ray',
    first_name: 'Eva',
    last_name: 'Ray',
    email: 'eva@x.com',
    phone: '',
    role: 'SALES_EXEC',
    commission_rate: '2.50',
  };

  it('shows email and commission read-only and saves name and phone', async () => {
    const { http, harness, el } = await setup('/settings/profile', ProfilePage);
    http.expectOne('/api/v1/me').flush(profile);
    harness.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#pf-email')!.readOnly).toBe(true);
    expect(el.querySelector<HTMLInputElement>('#pf-rate')!.value).toBe('2.50%');
    expect(el.querySelector('a[href="/account/change-password"]')).not.toBeNull();

    const phone = el.querySelector<HTMLInputElement>('#pf-phone')!;
    phone.value = '+91 99';
    phone.dispatchEvent(new Event('input'));
    harness.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne('/api/v1/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ first_name: 'Eva', last_name: 'Ray', phone: '+91 99' });
    req.flush({ ...profile, first_name: 'Evie', name: 'Evie Ray', phone: '+91 99' });
    expect(TestBed.inject(AuthService).user()?.name).toBe('Evie Ray');
  });

  it('hides the commission field for non-execs', async () => {
    const { http, harness, el } = await setup('/settings/profile', ProfilePage);
    http.expectOne('/api/v1/me').flush({ ...profile, role: 'ADMIN', commission_rate: null });
    harness.detectChanges();
    expect(el.querySelector('#pf-rate')).toBeNull();
  });
});
