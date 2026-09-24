import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { firstName, greeting } from '../../core/models/user-display';
import { RoleBadge } from '../../shared/role-badge/role-badge';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';
import { LayoutService } from '../layout.service';

/** Deepest active route: its `title` is the page name. */
const leaf = (route: ActivatedRouteSnapshot): ActivatedRouteSnapshot =>
  route.firstChild ? leaf(route.firstChild) : route;

/** "Ctrl" everywhere except Apple platforms, where it's the Command key. */
export const MOD_KEY_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

@Component({
  selector: 'app-topbar',
  imports: [MatIconModule, MatMenuModule, MatTooltipModule, RoleBadge, RouterLink, UserAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly layout = inject(LayoutService);
  protected readonly firstName = firstName;
  protected readonly greeting = greeting;
  protected readonly modKey = MOD_KEY_LABEL;

  /** Current page name, taken from the active route's `title`. */
  protected readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.currentTitle()),
    ),
    { initialValue: this.currentTitle() },
  );

  /** Search button clicked (the shell opens the command palette). */
  readonly searchOpen = output<void>();

  private currentTitle(): string {
    return leaf(this.router.routerState.snapshot.root).title ?? '';
  }
}
