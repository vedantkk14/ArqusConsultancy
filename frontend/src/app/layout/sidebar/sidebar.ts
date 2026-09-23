import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NavItem, SIDEBAR_CONFIG, filterNavByRole } from '../../core/config/sidebar.config';
import { ROLE_LABELS } from '../../core/models';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { LayoutService } from '../layout.service';

/** Flyouts open to the right of the rail icon, aligned to its top (or bottom, near the screen edge). */
const FLYOUT_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 12 },
  { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom', offsetX: 12 },
];

@Component({
  selector: 'app-sidebar',
  imports: [
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    MatIconModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    UserAvatar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  host: { '[class.rail]': 'layout.collapsed()' },
})
export class Sidebar {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly layout = inject(LayoutService);
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly flyoutPositions = FLYOUT_POSITIONS;

  protected readonly items = computed(() => filterNavByRole(SIDEBAR_CONFIG, this.auth.role()));

  private readonly url = signal(this.router.url);
  /** Expanded mode: only one group open at a time. */
  protected readonly openGroup = signal<string | null>(null);

  constructor() {
    this.openActiveGroup(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.url.set(e.urlAfterRedirects);
        this.openActiveGroup(e.urlAfterRedirects);
      });
  }

  protected isActiveGroup(item: NavItem): boolean {
    return this.url().startsWith(item.route + '/');
  }

  protected isChildActive(route: string): boolean {
    const url = this.url().split(/[?#]/)[0];
    return url === route || url.startsWith(route + '/');
  }

  protected toggleGroup(item: NavItem): void {
    this.openGroup.update((open) => (open === item.route ? null : item.route));
  }

  protected slug(item: NavItem): string {
    return 'nav' + item.route.replace(/\W+/g, '-');
  }

  private openActiveGroup(url: string): void {
    const group = SIDEBAR_CONFIG.find((i) => i.children && url.startsWith(i.route + '/'));
    if (group) {
      this.openGroup.set(group.route);
    }
  }
}
