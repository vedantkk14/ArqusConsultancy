import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { PaginatedResponse } from '../../core/models';
import { AppNotification } from './notifications.models';

export const POLL_MS = 60_000;
export const RECENT_COUNT = 8;

/**
 * Unread badge + the bell's latest items. Polls /notifications/unread-count once a minute, but only while
 * the tab is visible (a hidden tab makes no requests); coming back to the tab refreshes at once.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(ApiService);

  readonly unread = signal(0);
  readonly recent = signal<AppNotification[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly onVisibility = () => {
    if (this.visible()) {
      this.refreshCount();
    }
  };

  private visible(): boolean {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.refreshCount();
    this.timer = setInterval(() => {
      if (this.visible()) {
        this.refreshCount();
      }
    }, POLL_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  refreshCount(): void {
    this.api.get<{ count: number }>('/notifications/unread-count').subscribe({
      next: (res) => this.unread.set(res.count),
      error: () => undefined, // keep the last known count; the next tick tries again
    });
  }

  loadRecent(): void {
    this.api.list<AppNotification>('/notifications', { page_size: RECENT_COUNT }).subscribe({
      next: (res) => this.recent.set(res.results),
      error: () => undefined,
    });
  }

  page(page: number, isRead?: boolean): Observable<PaginatedResponse<AppNotification>> {
    return this.api.list<AppNotification>('/notifications', {
      page,
      page_size: 20,
      is_read: isRead === undefined ? undefined : String(isRead),
    });
  }

  /** Optimistic: the badge drops at once; a failed save re-syncs from the server. */
  markRead(n: AppNotification): void {
    if (n.is_read) {
      return;
    }
    this.recent.update((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    this.unread.update((c) => Math.max(0, c - 1));
    this.api.post(`/notifications/${n.id}/read`).subscribe({ error: () => this.refreshCount() });
  }

  markAllRead(): void {
    this.recent.update((list) => list.map((x) => ({ ...x, is_read: true })));
    this.unread.set(0);
    this.api.post('/notifications/read-all').subscribe({ error: () => this.refreshCount() });
  }
}
