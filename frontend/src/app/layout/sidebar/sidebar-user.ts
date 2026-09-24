import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/models';
import { UserAvatar } from '../../shared/user-avatar/user-avatar';

/** Bottom of the sidebar: avatar, name, role and log-out. In the rail, the avatar opens an account menu. */
@Component({
  selector: 'app-sidebar-user',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, MatIconModule, MatTooltipModule, RouterLink, UserAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.rail]': 'rail()' },
  template: `
    @if (auth.user(); as user) {
      @if (rail()) {
        <button
          type="button"
          class="avatar-btn"
          aria-label="Account menu"
          [matTooltip]="user.name"
          matTooltipPosition="right"
          [cdkMenuTriggerFor]="account"
          [cdkMenuPosition]="positions()"
        >
          <app-user-avatar [name]="user.name" [size]="32" />
        </button>
        <ng-template #account>
          <div class="flyout" cdkMenu aria-label="Account">
            <div class="flyout-user" aria-hidden="true">
              <strong>{{ user.name }}</strong>
              <span>{{ roleLabels[user.role] }}</span>
            </div>
            <a cdkMenuItem class="flyout-item" routerLink="/settings/profile">Profile</a>
            <a cdkMenuItem class="flyout-item" routerLink="/account/change-password">Change password</a>
            <button cdkMenuItem type="button" class="flyout-item" (cdkMenuItemTriggered)="auth.logout()">
              Log out
            </button>
          </div>
        </ng-template>
      } @else {
        <app-user-avatar [name]="user.name" [size]="32" />
        <div class="who">
          <strong>{{ user.name }}</strong>
          <span>{{ roleLabels[user.role] }}</span>
        </div>
        <button type="button" class="icon-btn" aria-label="Log out" matTooltip="Log out" (click)="auth.logout()">
          <mat-icon aria-hidden="true">logout</mat-icon>
        </button>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 8px 12px 12px;
      padding: 10px 8px 10px 10px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--surface);
      box-shadow: var(--highlight), var(--shadow-1);
    }
    :host(.rail) {
      justify-content: center;
      margin: 8px 0 12px;
      padding: 0;
      border: 0;
      background: none;
      box-shadow: none;
    }
    .who {
      display: flex;
      min-width: 0;
      flex: 1;
      flex-direction: column;
      line-height: 1.3;
    }
    .who strong {
      overflow: hidden;
      color: var(--ink);
      font-size: var(--text-sm);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .who span {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .icon-btn,
    .avatar-btn {
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
    }
    .icon-btn {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      color: var(--ink-3);
    }
    .icon-btn:hover {
      background: var(--subtle);
      color: var(--ink);
    }
    .icon-btn mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .avatar-btn {
      border-radius: 50%;
    }
  `,
})
export class SidebarUser {
  readonly rail = input(false);
  readonly positions = input.required<ConnectedPosition[]>();

  protected readonly auth = inject(AuthService);
  protected readonly roleLabels = ROLE_LABELS;
}
