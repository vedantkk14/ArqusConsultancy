import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NotificationsPage } from './notifications-page';
import { metaFor, routeFor } from './notification-utils';
import { AppNotification } from './notifications.models';

const note = (id: number, type = 'lead_assigned', is_read = false): AppNotification => ({
  id, type, title: `Title ${id}`, body: `Body ${id}`, data: { lead_id: 9 }, is_read, created_at: new Date().toISOString(),
});
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function setup(url = '/notifications') {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'notifications', component: NotificationsPage }, { path: '**', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, NotificationsPage);
  const list = (results: AppNotification[], count = results.length) => {
    http.expectOne((r) => r.url === '/api/v1/notifications').flush({ count, next: null, previous: null, results });
    harness.detectChanges();
  };
  return { http, harness, el: harness.routeNativeElement as HTMLElement, list };
}

describe('NotificationsPage', () => {
  it('lists newest first with an icon per type, and unread rows are marked', async () => {
    const { el, list, http } = await setup();
    expect(http.match(() => false)).toEqual([]);
    list([note(1, 'lead_won'), note(2, 'budget_over', true)]);
    const rows = [...el.querySelectorAll('.row')];
    expect(rows.length).toBe(2);
    expect(rows[0].classList).toContain('unread');
    expect(rows[1].classList).not.toContain('unread');
    expect(text(rows[0].querySelector('mat-icon'))).toBe('emoji_events');
    expect(text(rows[1].querySelector('mat-icon'))).toBe('error');
    expect(text(rows[0])).toContain('(unread)');
  });

  it('the Unread tab asks the API for unread only, and shows the all-caught-up state', async () => {
    const { http, el, harness } = await setup('/notifications?tab=unread');
    const req = http.expectOne((r) => r.url === '/api/v1/notifications');
    expect(req.request.params.get('is_read')).toBe('false');
    req.flush({ count: 0, next: null, previous: null, results: [] });
    harness.detectChanges();
    expect(text(el)).toContain("You're all caught up.");
  });

  it('tapping a row marks it read and opens what it is about', async () => {
    const { http, el, list } = await setup();
    list([note(7, 'lead_won')]);
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('.row')!.click();
    http.expectOne('/api/v1/notifications/7/read').flush({});
    expect(nav).toHaveBeenCalledWith(['/leads', 9]);
  });

  it('shows an error with retry', async () => {
    const { http, el, harness } = await setup();
    http.expectOne((r) => r.url === '/api/v1/notifications').flush({}, { status: 500, statusText: 'x' });
    harness.detectChanges();
    expect(text(el.querySelector('app-error-state'))).toContain("Couldn't load notifications");
  });
});

describe('notification utils', () => {
  it('maps types to icons and destinations', () => {
    expect(metaFor('payment_received').icon).toBe('payments');
    expect(metaFor('mystery')).toEqual({ icon: 'notifications', tone: 'slate' });
    expect(routeFor(note(1, 'lead_assigned'))).toEqual(['/leads', 9]);
    expect(routeFor({ type: 'lead_won', data: {} })).toEqual(['/leads/all']);
    expect(routeFor(note(1, 'budget_warn'))).toEqual(['/expenses/alerts']);
    expect(routeFor(note(1, 'payment_received'))).toEqual(['/accounts/payments']);
    expect(routeFor({ type: 'payment_received', data: { ledger_id: 4 } })).toEqual(['/accounts/ledgers', 4]);
    expect(routeFor({ type: 'expense_added', data: { project_id: 9 } })).toEqual(['/projects', 9]);
    expect(routeFor({ type: 'budget_changed', data: {} })).toEqual(['/projects/running']);
    expect(metaFor('expense_added').icon).toBe('receipt_long');
    expect(routeFor(note(1, 'account_created'))).toBeNull();
  });
});
