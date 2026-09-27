import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ExecQueue } from '../sales-exec-dashboard.models';
import { ExecQueueRow } from './exec-queue-row';

/** Overdue first, then due today, one card with two subheadings (not two separate cards). */
@Component({
  selector: 'app-follow-up-now-card',
  imports: [ExecQueueRow, MatIconModule, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-label': 'Follow up now' },
  template: `
    <header class="hd">
      <span class="ic" aria-hidden="true"><mat-icon>call</mat-icon></span>
      <span class="tt">
        <h2>Follow up now</h2>
        <small>Overdue, then due today</small>
      </span>
    </header>

    @if (skeleton()) {
      @for (i of placeholders; track i) {
        <app-skeleton height="52px" radius="10px" />
      }
    } @else if (isEmpty()) {
      <p class="none"><mat-icon aria-hidden="true">check_circle</mat-icon>Nothing due right now.</p>
    } @else {
      @if (overdue().items.length) {
        <div class="sub">
          <div class="sub-hd">
            <span class="sub-title rose">Overdue</span>
            <span class="count num rose">{{ overdue().total }}</span>
          </div>
          <div class="rows">
            @for (item of overdue().items; track item.id) {
              <app-exec-queue-row [row]="item" />
            }
          </div>
          @if (overdue().total > overdue().items.length) {
            <a class="va" routerLink="/leads/overdue">View all {{ overdue().total }}<mat-icon aria-hidden="true">arrow_forward</mat-icon></a>
          }
        </div>
      }
      @if (today().items.length) {
        <div class="sub">
          <div class="sub-hd">
            <span class="sub-title amber">Today</span>
            <span class="count num amber">{{ today().total }}</span>
          </div>
          <div class="rows">
            @for (item of today().items; track item.id) {
              <app-exec-queue-row [row]="item" />
            }
          </div>
          @if (today().total > today().items.length) {
            <a class="va" routerLink="/leads/all" [queryParams]="{ followup: 'today' }">
              View all {{ today().total }}<mat-icon aria-hidden="true">arrow_forward</mat-icon>
            </a>
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: var(--space-5);
    }
    .hd {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: var(--space-3);
    }
    .ic {
      display: grid;
      width: 36px;
      height: 36px;
      flex: none;
      place-items: center;
      border-radius: 10px;
      background: var(--tint-rose);
      color: var(--tint-rose-ink);
    }
    .ic mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
    }
    .tt {
      display: flex;
      flex-direction: column;
    }
    h2 {
      margin: 0;
      font-size: var(--text-md);
    }
    small {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .sub + .sub {
      margin-top: var(--space-4);
      padding-top: var(--space-4);
      border-top: 1px solid var(--line);
    }
    .sub-hd {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .sub-title {
      font-size: var(--text-sm);
      font-weight: 700;
    }
    .sub-title.rose {
      color: var(--tint-rose-ink);
    }
    .sub-title.amber {
      color: var(--tint-amber-ink);
    }
    .count {
      min-width: 24px;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: var(--text-xs);
      font-weight: 700;
      text-align: center;
    }
    .count.rose {
      background: var(--tint-rose);
      color: var(--tint-rose-ink);
    }
    .count.amber {
      background: var(--tint-amber);
      color: var(--tint-amber-ink);
    }
    .rows {
      display: flex;
      flex-direction: column;
    }
    .none {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin: 0;
      padding: 40px 8px;
      color: var(--ink-3);
      font-size: var(--text-sm);
      text-align: center;
    }
    .none mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--positive);
    }
    .va {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 32px;
      margin-top: 6px;
      color: var(--brand-deep);
      font-size: var(--text-sm);
      font-weight: 600;
      text-decoration: none;
    }
    .va:hover {
      text-decoration: underline;
    }
    .va mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
  `,
})
export class FollowUpNowCard {
  readonly overdue = input.required<ExecQueue>();
  readonly today = input.required<ExecQueue>();
  readonly skeleton = input(false);

  protected readonly isEmpty = computed(() => this.overdue().items.length === 0 && this.today().items.length === 0);
  protected readonly placeholders = [0, 1, 2];
}
