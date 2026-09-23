import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AttentionItem } from '../dashboard.models';

const SEVERITY_TEXT: Record<AttentionItem['severity'], string> = {
  high: 'Urgent',
  medium: 'Soon',
  low: 'When you can',
};

/** "Waiting on you": things that need action, each with a severity marker and a link. */
@Component({
  selector: 'app-attention-panel',
  imports: [MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card', role: 'region', 'aria-labelledby': 'attention-title' },
  template: `
    <h2 id="attention-title">Waiting on you</h2>
    @if (items().length) {
      <ul>
        @for (item of items(); track item.key) {
          <li>
            <a class="row" [class]="'sev-' + item.severity" [routerLink]="item.route">
              <span class="sev" aria-hidden="true"></span>
              <span class="label">{{ item.label }}</span>
              <span class="sr-only">({{ severityText[item.severity] }})</span>
              <span class="count num">{{ item.count }}</span>
              <mat-icon aria-hidden="true">chevron_right</mat-icon>
            </a>
          </li>
        }
      </ul>
    } @else {
      <p class="clear"><mat-icon aria-hidden="true">check_circle</mat-icon>All clear. Nothing needs you right now.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: 16px 8px 8px;
    }
    h2 {
      margin: 0 8px 8px;
      font-size: var(--text-base);
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 0 8px;
      border-radius: var(--radius-sm);
      color: var(--ink-2);
      text-decoration: none;
    }
    .row:hover {
      background: var(--subtle);
      color: var(--ink);
    }
    mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      color: var(--ink-3);
    }
    .sev {
      width: 3px;
      height: 20px;
      flex: none;
      border-radius: 3px;
    }
    .sev-high .sev { background: var(--negative); }
    .sev-medium .sev { background: var(--warning); }
    .sev-low .sev { background: var(--brand-deep); }
    .label {
      flex: 1;
      min-width: 0;
    }
    .count {
      color: var(--ink);
      font-weight: 600;
    }
    .clear {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 8px 8px;
      color: var(--ink-3);
    }
    .clear mat-icon {
      color: var(--positive);
    }
  `,
})
export class AttentionPanel {
  readonly items = input.required<AttentionItem[]>();
  protected readonly severityText = SEVERITY_TEXT;
}
