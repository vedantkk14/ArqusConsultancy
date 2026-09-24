import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Centered icon + title + message. Set `bordered` to render it as a card. Project actions into it. */
@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty" [class.card]="bordered()">
      <mat-icon class="icon" aria-hidden="true">{{ icon() }}</mat-icon>
      <h2>{{ title() }}</h2>
      @if (message()) {
        <p>{{ message() }}</p>
      }
      <ng-content />
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 48px 20px;
      text-align: center;
    }
    .icon {
      width: 24px;
      height: 24px;
      margin-bottom: 6px;
      font-size: 24px;
      color: var(--ink-3);
    }
    h2 {
      font-size: var(--text-md);
    }
    p {
      max-width: 44ch;
      margin: 0;
      color: var(--ink-3);
    }
  `,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly message = input('');
  readonly bordered = input(true);
}
