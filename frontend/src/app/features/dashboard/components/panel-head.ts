import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

/** The one panel header pattern: title, one muted line, and a "View all" link or a projected control. */
@Component({
  selector: 'app-panel-head',
  imports: [MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="t">
      <h2 [id]="headingId()">{{ title() }}</h2>
      @if (subtitle()) {
        <p>{{ subtitle() }}</p>
      }
    </div>
    <div class="r">
      <ng-content />
      @if (link()) {
        <a class="va" [routerLink]="link()">{{ linkLabel() }}<mat-icon aria-hidden="true">chevron_right</mat-icon></a>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: var(--space-4);
    }
    .t {
      min-width: 0;
    }
    h2 {
      font-size: var(--text-md);
    }
    p {
      margin: 2px 0 0;
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .r {
      display: flex;
      flex: none;
      align-items: center;
      gap: 8px;
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
export class PanelHead {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly link = input<string | null>(null);
  readonly linkLabel = input('View all');
  readonly headingId = input<string | null>(null);
}
