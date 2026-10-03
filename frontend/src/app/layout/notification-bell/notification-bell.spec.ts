import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationsService } from '../../features/notifications/notifications.service';
import { NotificationBell } from './notification-bell';

describe('NotificationBell', () => {
  const service = {
    unread: signal(2),
    recent: signal([]),
    start: () => undefined,
    stop: () => undefined,
    loadRecent: () => undefined,
    markAllRead: () => undefined,
    markRead: () => undefined,
  };

  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: NotificationsService, useValue: service }],
    }),
  );

  it('has a close button in the panel that dismisses it', async () => {
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.bell').click();
    fixture.detectChanges();
    await fixture.whenStable();

    const close = document.querySelector<HTMLButtonElement>('.np-close');
    expect(close?.getAttribute('aria-label')).toBe('Close notifications');
    close!.click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(document.querySelector('.np-close')).toBeNull();
  });
});
