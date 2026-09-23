import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SIDEBAR_CONFIG, filterNavByRole } from '../../core/config/sidebar.config';
import { MoreSheet } from '../more-sheet/more-sheet';
import { entryRoute } from '../nav-helpers';

/** Top-level items shown as tabs; everything else is in the "More" sheet. */
export const PRIMARY_TAB_COUNT = 4;

/** Mobile/tablet (< 1024px) bottom navigation. */
@Component({
  selector: 'app-tabbar',
  imports: [MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabbar.html',
  styleUrl: './tabbar.scss',
})
export class Tabbar {
  private readonly router = inject(Router);
  private readonly sheet = inject(MatBottomSheet);
  private readonly auth = inject(AuthService);
  private readonly url = signal(this.router.url);

  protected readonly tabs = computed(() =>
    filterNavByRole(SIDEBAR_CONFIG, this.auth.role())
      .slice(0, PRIMARY_TAB_COUNT)
      .map((item) => ({ label: item.label, icon: item.icon, base: item.route, route: entryRoute(item) })),
  );

  /** "More" is active when the current page is not under one of the tabs. */
  protected readonly moreActive = computed(() => !this.tabs().some((t) => this.isActive(t.base)));

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  protected isActive(base: string): boolean {
    const url = this.url().split(/[?#]/)[0];
    return url === base || url.startsWith(base + '/');
  }

  protected openMore(): void {
    this.sheet.open(MoreSheet, { ariaLabel: 'More pages' });
  }
}
