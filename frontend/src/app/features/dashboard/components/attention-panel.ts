import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AttentionItem } from '../dashboard.models';
import { ATTENTION_SHORT_LABELS } from '../dashboard-utils';
import { PanelHead } from './panel-head';

const SEVERITY_TEXT: Record<AttentionItem['severity'], string> = {
  high: 'Urgent',
  medium: 'Soon',
  low: 'When you can',
};

/** "Waiting on you": things that need action, most urgent first, each with a severity word and a link. */
@Component({
  selector: 'app-attention-panel',
  imports: [MatIconModule, PanelHead, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card', role: 'region', 'aria-labelledby': 'attention-title' },
  template: `
    <app-panel-head title="Waiting on you" subtitle="Needs action" headingId="attention-title">
      @if (total()) {
        <span class="total num" [attr.aria-label]="total() + ' items in total'">{{ total() }}</span>
      }
    </app-panel-head>
    @if (items().length) {
      <ul>
        @for (item of items(); track item.key; let first = $first) {
          <li>
            <a class="row" [class]="'sev-' + item.severity" [class.top]="first" [routerLink]="item.route" [attr.title]="item.label">
              <span class="sev" aria-hidden="true"></span>
              <span class="text">
                <span class="name">{{ short(item) }}</span>
                <span class="word">{{ severityText[item.severity] }}</span>
              </span>
              <span class="count num">{{ item.count }}</span>
              <mat-icon aria-hidden="true">chevron_right</mat-icon>
            </a>
          </li>
        }
      </ul>
    } @else {
      <p class="clear"><mat-icon aria-hidden="true">check_circle</mat-icon>Nothing is waiting on you.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: var(--space-5);
    }
    .total {
      min-width: 28px;
      padding: 2px 9px;
      border-radius: 999px;
      background: var(--ink);
      color: var(--on-ink);
      font-size: var(--text-sm);
      font-weight: 600;
      text-align: center;
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0 -8px;
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 0 8px;
      border-radius: var(--radius-sm);
      color: var(--ink-2);
      text-decoration: none;
      transition: background-color 150ms ease;
    }
    .row:hover {
      background: var(--tint-slate);
      color: var(--ink);
    }
    .row.top {
      min-height: 56px;
      background: var(--surface-2);
      color: var(--ink);
    }
    .row.top .name {
      font-weight: 600;
    }
    .text {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      line-height: 1.25;
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .word {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      color: var(--ink-3);
    }
    .sev {
      width: 3px;
      height: 24px;
      flex: none;
      border-radius: 3px;
    }
    .sev-high .sev { background: var(--negative); }
    .sev-medium .sev { background: var(--warning); }
    .sev-low .sev { background: var(--brand-deep); }
    .count {
      min-width: 28px;
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--tint-cyan);
      color: var(--tint-cyan-ink);
      font-weight: 600;
      text-align: center;
    }
    .sev-high .count { background: var(--tint-rose); color: var(--tint-rose-ink); }
    .sev-medium .count { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .clear {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 120px;
      margin: 0;
      color: var(--ink-2);
    }
    .clear mat-icon {
      color: var(--positive);
    }
  `,
})
export class AttentionPanel {
  readonly items = input.required<AttentionItem[]>();
  protected readonly severityText = SEVERITY_TEXT;
  protected readonly total = computed(() => this.items().reduce((sum, i) => sum + i.count, 0));

  protected short(item: AttentionItem): string {
    return ATTENTION_SHORT_LABELS[item.key] ?? item.label;
  }
}
