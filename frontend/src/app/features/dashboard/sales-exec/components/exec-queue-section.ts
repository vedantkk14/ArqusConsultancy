import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { ExecLeadItem } from '../sales-exec-dashboard.models';
import { ExecQueueRow } from './exec-queue-row';

export type QueueTone = 'rose' | 'amber' | 'cyan' | 'teal';

/** One dashboard card: icon, title, count, the first few leads, an optional hint, "View all". */
@Component({
  selector: 'app-exec-queue-section',
  imports: [ExecQueueRow, MatIconModule, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel queue-section', role: 'region', '[attr.data-tone]': 'tone()', '[attr.aria-label]': 'title()' },
  template: `
    <header class="hd">
      <span class="ic" aria-hidden="true"><mat-icon>{{ icon() }}</mat-icon></span>
      <span class="tt">
        <h2>{{ title() }}</h2>
        <small>{{ subtitle() }}</small>
      </span>
      <span class="count num" [attr.aria-label]="total() + ' in total'">{{ total() }}</span>
    </header>

    @if (hint()) {
      <p class="hint"><mat-icon aria-hidden="true">info</mat-icon>{{ hint() }}</p>
    }

    @if (skeleton()) {
      @for (i of placeholders; track i) {
        <app-skeleton height="52px" radius="10px" />
      }
    } @else if (items().length) {
      <div class="rows">
        @for (item of items().slice(0, maxRows()); track item.id) {
          <app-exec-queue-row [row]="item" [showFollowup]="showFollowup()" />
        }
      </div>
    } @else {
      <p class="none"><mat-icon aria-hidden="true">check_circle</mat-icon>{{ emptyText() }}</p>
    }

    @if (viewAllRoute() && total() > 0) {
      <a class="va" [routerLink]="viewAllRoute()" [queryParams]="viewAllParams()">
        @if (total() > items().slice(0, maxRows()).length) {
          View all {{ total() }}
        } @else {
          Open list
        }
        <mat-icon aria-hidden="true">arrow_forward</mat-icon>
      </a>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 220px;
      border-top: 3px solid var(--accent, var(--line));
    }
    :host([data-tone='rose']) { --accent: var(--negative); --ic-bg: var(--tint-rose); --ic-ink: var(--tint-rose-ink); }
    :host([data-tone='amber']) { --accent: var(--data-amber); --ic-bg: var(--tint-amber); --ic-ink: var(--tint-amber-ink); }
    :host([data-tone='cyan']) { --accent: var(--brand); --ic-bg: var(--tint-cyan); --ic-ink: var(--tint-cyan-ink); }
    :host([data-tone='teal']) { --accent: var(--data-teal); --ic-bg: var(--tint-teal); --ic-ink: var(--tint-teal-ink); }

    .hd {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: var(--space-2);
    }
    .ic {
      display: grid;
      width: 36px;
      height: 36px;
      flex: none;
      place-items: center;
      border-radius: 10px;
      background: var(--ic-bg, var(--tint-slate));
      color: var(--ic-ink, var(--ink-2));
    }
    .ic mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
    }
    .tt {
      display: flex;
      flex: 1;
      min-width: 0;
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
    .count {
      min-width: 32px;
      padding: 2px 10px;
      border-radius: 999px;
      background: var(--ic-bg, var(--tint-slate));
      color: var(--ic-ink, var(--ink));
      font-size: var(--text-sm);
      font-weight: 700;
      text-align: center;
    }
    .hint {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 var(--space-3);
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      background: var(--tint-amber);
      color: var(--tint-amber-ink);
      font-size: var(--text-xs);
    }
    .hint mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
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
      padding: 24px 8px;
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
      align-self: flex-start;
      align-items: center;
      gap: 4px;
      min-height: 36px;
      margin-top: auto;
      padding-top: var(--space-3);
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
export class ExecQueueSection {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly icon = input('inbox');
  readonly tone = input<QueueTone>('cyan');
  readonly hint = input('');
  readonly items = input.required<ExecLeadItem[]>();
  readonly total = input(0);
  readonly maxRows = input(5);
  readonly showFollowup = input(true);
  readonly viewAllRoute = input<string | null>(null);
  readonly viewAllParams = input<Record<string, string>>({});
  readonly emptyText = input('Nothing here.');
  readonly skeleton = input(false);

  protected readonly placeholders = [0, 1, 2];
}
