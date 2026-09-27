import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { interval, map } from 'rxjs';
import { ApiError } from '../../core/models';
import { relativeTime } from '../dashboard/dashboard-utils';
import { EmptyState } from '../../shared/empty-state/empty-state';
import { ErrorState } from '../../shared/error-state/error-state';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { metaFor, routeFor } from './notification-utils';
import { AppNotification } from './notifications.models';
import { NotificationsService } from './notifications.service';

type Tab = 'all' | 'unread';

/** Every notification, newest first. Tapping one marks it read and opens what it is about. */
@Component({
  selector: 'app-notifications-page',
  imports: [EmptyState, ErrorState, MatButtonModule, MatIconModule, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
})
export class NotificationsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly service = inject(NotificationsService);

  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly tab = computed<Tab>(() => (this.query().get('tab') === 'unread' ? 'unread' : 'all'));
  protected readonly rows = signal<AppNotification[]>([]);
  protected readonly count = signal(0);
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly hasMore = computed(() => this.rows().length < this.count());
  protected readonly now = toSignal(interval(60_000).pipe(map(() => new Date())), { initialValue: new Date() });
  protected readonly placeholders = [0, 1, 2, 3, 4];
  protected readonly meta = metaFor;
  protected readonly ago = relativeTime;
  private page = 1;

  constructor() {
    effect(() => {
      const tab = this.tab();
      untracked(() => this.load(tab, 1));
    });
  }

  protected setTab(tab: Tab): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab === 'all' ? null : tab }, queryParamsHandling: 'merge' });
  }

  protected load(tab: Tab, page: number): void {
    this.loading.set(true);
    this.service.page(page, tab === 'unread' ? false : undefined).subscribe({
      next: (res) => {
        this.page = page;
        this.count.set(res.count);
        this.rows.update((rows) => (page === 1 ? res.results : [...rows, ...res.results]));
        this.error.set(null);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err: ApiError) => {
        this.error.set(err);
        this.loading.set(false);
      },
    });
  }

  protected more(): void {
    this.load(this.tab(), this.page + 1);
  }

  protected open(n: AppNotification): void {
    this.service.markRead(n);
    if (this.tab() === 'unread') {
      this.rows.update((rows) => rows.filter((r) => r.id !== n.id));
      this.count.update((c) => Math.max(0, c - 1));
    } else {
      this.rows.update((rows) => rows.map((r) => (r.id === n.id ? { ...r, is_read: true } : r)));
    }
    const target = routeFor(n);
    if (target) {
      void this.router.navigate(target);
    }
  }

  protected markAll(): void {
    this.service.markAllRead();
    this.rows.update((rows) => (this.tab() === 'unread' ? [] : rows.map((r) => ({ ...r, is_read: true }))));
    this.count.set(this.tab() === 'unread' ? 0 : this.count());
  }
}
