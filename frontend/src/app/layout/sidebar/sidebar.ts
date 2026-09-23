import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NavItem, SIDEBAR_CONFIG, filterNavByRole } from '../../core/config/sidebar.config';

@Component({
  selector: 'app-sidebar',
  imports: [MatIconModule, MatListModule, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Fired after a link is clicked (the shell closes the drawer on mobile). */
  readonly navigated = output<void>();

  protected readonly items = computed(() => filterNavByRole(SIDEBAR_CONFIG, this.auth.role()));
  private readonly openGroups = signal<ReadonlySet<string>>(new Set());

  constructor() {
    this.expandActiveGroup(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.expandActiveGroup(e.urlAfterRedirects));
  }

  protected isOpen(item: NavItem): boolean {
    return this.openGroups().has(item.route);
  }

  protected toggle(item: NavItem): void {
    this.openGroups.update((groups) => {
      const next = new Set(groups);
      if (!next.delete(item.route)) {
        next.add(item.route);
      }
      return next;
    });
  }

  private expandActiveGroup(url: string): void {
    const group = SIDEBAR_CONFIG.find((i) => i.children && url.startsWith(i.route + '/'));
    if (group) {
      this.openGroups.update((groups) => new Set(groups).add(group.route));
    }
  }
}
