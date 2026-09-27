import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SIDEBAR_CONFIG, filterNavByRole } from '../../core/config/sidebar.config';

/** Every page the role can open, grouped as in the sidebar. Opened from the mobile "More" tab. */
@Component({
  selector: 'app-more-sheet',
  imports: [MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sheet">
      <div class="grabber" aria-hidden="true"></div>
      <h2 class="title">All pages</h2>
      @for (item of groups(); track item.route) {
        <section>
          @if (item.children) {
            <h3 class="group">{{ item.label }}</h3>
          }
          <ul>
            @for (page of item.children ?? [item]; track page.route) {
              <li>
                <a class="row" [routerLink]="page.route" (click)="close()">
                  <mat-icon aria-hidden="true">{{ page.icon }}</mat-icon>
                  <span>{{ page.label }}</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }
      <button type="button" class="row logout" (click)="logout()">
        <mat-icon aria-hidden="true">logout</mat-icon>
        <span>Log out</span>
      </button>
    </div>
  `,
  styles: `
    .sheet {
      max-height: 75vh;
      overflow-y: auto;
      padding: 8px 4px 16px;
    }
    .grabber {
      width: 36px;
      height: 4px;
      margin: 0 auto 12px;
      border-radius: 999px;
      background: var(--plate);
    }
    .title {
      margin: 0 12px 8px;
      font-size: var(--text-md);
    }
    .group {
      margin: 12px 12px 4px;
      color: var(--ink-3);
      font-size: var(--text-xs);
      font-weight: 500;
      letter-spacing: 0;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 44px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--ink);
      font: inherit;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }
    .row:hover {
      background: var(--subtle);
    }
    .row mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--ink-3);
    }
    .logout {
      margin-top: 12px;
      border-top: 1px solid var(--line);
      border-radius: 0;
    }
  `,
})
export class MoreSheet {
  private readonly ref = inject(MatBottomSheetRef<MoreSheet>);
  private readonly auth = inject(AuthService);

  protected readonly groups = computed(() => filterNavByRole(SIDEBAR_CONFIG, this.auth.role()));

  protected close(): void {
    this.ref.dismiss();
  }

  protected logout(): void {
    this.ref.dismiss();
    this.auth.logout();
  }
}
