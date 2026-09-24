import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { relativeTime } from '../../features/dashboard/dashboard-utils';
import { metaFor, routeFor } from '../../features/notifications/notification-utils';
import { AppNotification } from '../../features/notifications/notifications.models';
import { NotificationsService } from '../../features/notifications/notifications.service';

/** The bell: unread dot, the latest 8, "Mark all read" and "View all". Keeps the badge fresh by polling. */
@Component({
  selector: 'app-notification-bell',
  imports: [MatIconModule, MatMenuModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss',
})
export class NotificationBell implements OnInit, OnDestroy {
  protected readonly service = inject(NotificationsService);
  protected readonly meta = metaFor;
  protected readonly ago = relativeTime;
  protected readonly link = (n: AppNotification) => routeFor(n) ?? ['/notifications'];
  protected readonly loaded = signal(false);
  protected readonly label = computed(() =>
    this.service.unread() ? `Notifications, ${this.service.unread()} unread` : 'Notifications',
  );

  ngOnInit(): void {
    this.service.start();
  }

  ngOnDestroy(): void {
    this.service.stop();
  }

  protected opened(): void {
    this.service.loadRecent();
    this.loaded.set(true);
  }
}
