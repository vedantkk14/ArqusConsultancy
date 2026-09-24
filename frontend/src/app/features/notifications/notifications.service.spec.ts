import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { POLL_MS, NotificationsService } from './notifications.service';
import { AppNotification } from './notifications.models';

const COUNT = '/api/v1/notifications/unread-count';
const note = (id: number, is_read = false): AppNotification => ({
  id,
  type: 'lead_assigned',
  title: 'New lead assigned',
  body: 'Acme was assigned to you.',
  data: { lead_id: 4 },
  is_read,
  created_at: '2026-09-24T10:00:00Z',
});

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { service: TestBed.inject(NotificationsService), http: TestBed.inject(HttpTestingController) };
}
const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

describe('NotificationsService', () => {
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('shows the unread count and lowers it as notifications are read', () => {
    const { service, http } = setup();
    service.start();
    http.expectOne(COUNT).flush({ count: 3 });
    expect(service.unread()).toBe(3);

    service.recent.set([note(1), note(2), note(3, true)]);
    service.markRead(service.recent()[0]);
    expect(service.unread()).toBe(2);
    expect(service.recent()[0].is_read).toBe(true);
    http.expectOne('/api/v1/notifications/1/read').flush({});

    service.markRead(service.recent()[2]); // already read: nothing happens
    http.expectNone('/api/v1/notifications/3/read');
    expect(service.unread()).toBe(2);

    service.markAllRead();
    expect(service.unread()).toBe(0);
    expect(service.recent().every((n) => n.is_read)).toBe(true);
    http.expectOne('/api/v1/notifications/read-all').flush({ updated: 2 });
    service.stop();
  });

  it('re-syncs from the server when a mark-read fails', () => {
    const { service, http } = setup();
    service.recent.set([note(1)]);
    service.unread.set(1);
    service.markRead(service.recent()[0]);
    http.expectOne('/api/v1/notifications/1/read').flush({}, { status: 500, statusText: 'x' });
    http.expectOne(COUNT).flush({ count: 1 });
    expect(service.unread()).toBe(1);
  });

  it('polls every minute while the tab is visible and makes no requests while it is hidden', () => {
    vi.useFakeTimers();
    const { service, http } = setup();
    service.start();
    http.expectOne(COUNT).flush({ count: 0 });

    vi.advanceTimersByTime(POLL_MS);
    http.expectOne(COUNT).flush({ count: 1 });
    expect(service.unread()).toBe(1);

    setVisibility('hidden');
    vi.advanceTimersByTime(POLL_MS * 3);
    http.expectNone(COUNT);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange')); // coming back refreshes at once
    http.expectOne(COUNT).flush({ count: 5 });
    expect(service.unread()).toBe(5);

    service.stop();
    vi.advanceTimersByTime(POLL_MS * 2);
    http.expectNone(COUNT);
  });

  it('keeps the last count when a poll fails', () => {
    const { service, http } = setup();
    service.unread.set(4);
    service.refreshCount();
    http.expectOne(COUNT).flush({}, { status: 500, statusText: 'x' });
    expect(service.unread()).toBe(4);
  });
});
