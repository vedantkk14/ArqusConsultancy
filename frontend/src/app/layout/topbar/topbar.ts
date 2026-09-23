import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/models';

/** Deepest active route: its `title` is the page name. */
const leaf = (route: ActivatedRouteSnapshot): ActivatedRouteSnapshot =>
  route.firstChild ? leaf(route.firstChild) : route;

@Component({
  selector: 'app-topbar',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatToolbarModule, MatTooltipModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly roleLabels = ROLE_LABELS;

  /** Current page name, taken from the active route's `title`. */
  protected readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.currentTitle()),
    ),
    { initialValue: this.currentTitle() },
  );

  /** Hamburger clicked (only shown on mobile). */
  readonly menuToggle = output<void>();

  private currentTitle(): string {
    return leaf(this.router.routerState.snapshot.root).title ?? '';
  }
}
