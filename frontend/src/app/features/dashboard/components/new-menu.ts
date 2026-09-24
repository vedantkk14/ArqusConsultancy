import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { findNavItem } from '../../../core/config/route-helpers';

export const NEW_ACTIONS = [
  { label: 'Add lead', icon: 'person_add', route: '/leads/new' },
  { label: 'Record payment', icon: 'payments', route: '/accounts/payments' },
  { label: 'Convert won lead', icon: 'transform', route: '/projects/convert' },
];

/** One "+ New" menu. `fab` renders it as the floating button above the mobile tab bar. */
@Component({
  selector: 'app-new-menu',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="trigger" [class.fab]="fab()" [cdkMenuTriggerFor]="menu" [attr.aria-label]="fab() ? 'New' : null">
      <mat-icon aria-hidden="true">add</mat-icon>
      @if (!fab()) {
        <span>New</span>
      }
    </button>
    <ng-template #menu>
      <div class="flyout" cdkMenu>
        @for (a of actions(); track a.route) {
          <a class="flyout-item" cdkMenuItem [routerLink]="a.route"><mat-icon aria-hidden="true">{{ a.icon }}</mat-icon>{{ a.label }}</a>
        }
      </div>
    </ng-template>
  `,
  styles: `
    .trigger {
      display: inline-flex; min-height: 44px; align-items: center; gap: 6px; padding: 0 16px;
      border: 0; border-radius: var(--radius-control); background: var(--ink); color: var(--on-ink);
      font: inherit; font-weight: 600; cursor: pointer;
    }
    .trigger:hover { box-shadow: var(--shadow-2); }
    .fab {
      position: fixed; right: 16px; bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px); z-index: 20;
      width: 56px; height: 56px; justify-content: center; padding: 0; border-radius: 50%; box-shadow: var(--shadow-3);
    }
  `,
})
export class NewMenu {
  readonly fab = input(false);
  private readonly auth = inject(AuthService);

  readonly actions = computed(() => {
    const role = this.auth.role();
    return NEW_ACTIONS.filter((a) => role && findNavItem(a.route)?.roles.includes(role));
  });
}
