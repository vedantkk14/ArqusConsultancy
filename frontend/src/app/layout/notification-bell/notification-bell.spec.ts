import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppNotification } from '../../features/notifications/notifications.models';
import { NotificationsService } from '../../features/notifications/notifications.service';
import { NotificationBell } from './notification-bell';

describe('NotificationBell', () => {
  const mockNotifications: AppNotification[] = [
    {
      id: 1,
      type: 'expense_added',
      title: 'Expense added',
      body: 'badgu sai logged Transport ₹1,21,212 on Vaishnavi Sales.',
      data: { project_id: 10 },
      is_read: false,
      created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    },
    {
      id: 2,
      type: 'deal_finalized',
      title: 'Deal finalised',
      body: 'Vaishnavi Sales is final. The project can start.',
      data: { lead_id: 5 },
      is_read: true,
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ];

  const service = {
    unread: signal(1),
    recent: signal<AppNotification[]>(mockNotifications),
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

  it('renders notifications with header, title, timestamp and body in top row layout', async () => {
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.bell').click();
    fixture.detectChanges();
    await fixture.whenStable();

    const items = document.querySelectorAll('.np-item');
    expect(items.length).toBe(2);

    const firstItem = items[0];
    expect(firstItem.classList.contains('unread')).toBe(true);
    expect(firstItem.querySelector('.np-ttl')?.textContent).toContain('Expense added');
    expect(firstItem.querySelector('.np-body')?.textContent).toContain('badgu sai logged Transport');
    expect(firstItem.querySelector('.np-when')?.textContent).toBeTruthy();
    expect(firstItem.querySelector('.np-unread-dot')).not.toBeNull();

    const secondItem = items[1];
    expect(secondItem.classList.contains('unread')).toBe(false);
    expect(secondItem.querySelector('.np-ttl')?.textContent).toContain('Deal finalised');
    expect(secondItem.querySelector('.np-unread-dot')).toBeNull();
  });
});
