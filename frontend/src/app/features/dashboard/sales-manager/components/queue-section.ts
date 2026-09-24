import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Skeleton } from '../../../../shared/skeleton/skeleton';
import { PanelHead } from '../../components/panel-head';
import { QueueLeadItem } from '../sales-manager-dashboard.models';
import { QueueRow } from './queue-row';

/** One "Needs attention" card: title, count, "View all" link, rows or an empty line. */
@Component({
  selector: 'app-queue-section',
  imports: [MatIconModule, PanelHead, QueueRow, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel queue-section', role: 'region', '[class.priority]': 'priority()' },
  template: `
    <app-panel-head [title]="title()">
      @if (viewAllRoute()) {
        <a class="va" [routerLink]="viewAllRoute()" [queryParams]="viewAllParams()">
          View all ({{ total() }})<mat-icon aria-hidden="true">chevron_right</mat-icon>
        </a>
      }
    </app-panel-head>
    @if (skeleton()) {
      @for (i of placeholders; track i) {
        <app-skeleton height="52px" radius="10px" />
      }
    } @else if (items().length) {
      <div class="rows">
        @for (item of items(); track item.id) {
          <app-queue-row [row]="item" (assign)="assign.emit($event)" (whatsapp)="whatsapp.emit($event)" />
        }
      </div>
    } @else {
      <p class="none">{{ emptyText() }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: var(--space-5);
    }
    .rows {
      display: flex;
      flex-direction: column;
    }
    .none {
      margin: 0;
      padding: 8px 4px;
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    :host(.priority) .rows {
      border: 1px solid var(--tint-amber-ink, var(--line));
      border-radius: var(--radius-sm);
      background: var(--tint-amber);
      padding: 4px 8px;
    }
    .va {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      color: var(--brand-deep);
      font-size: var(--text-sm);
      font-weight: 500;
      text-decoration: none;
      white-space: nowrap;
    }
    .va:hover {
      text-decoration: underline;
    }
    .va mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
  `,
})
export class QueueSection {
  readonly title = input.required<string>();
  readonly items = input.required<QueueLeadItem[]>();
  readonly total = input(0);
  readonly viewAllRoute = input<string | null>(null);
  readonly viewAllParams = input<Record<string, string>>({});
  readonly emptyText = input('Nothing here.');
  readonly skeleton = input(false);
  /** Extra visual weight (the amber tint) for a section that is unusual when non-empty. */
  readonly priority = input(false);
  readonly assign = output<QueueLeadItem>();
  readonly whatsapp = output<QueueLeadItem>();

  protected readonly placeholders = [0, 1, 2];
}
