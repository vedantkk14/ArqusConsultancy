import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Centered icon + title + message. Project content into it for action buttons. */
@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <mat-icon class="empty-icon" aria-hidden="true">{{ icon() }}</mat-icon>
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
      text-align: center;
      gap: var(--space-2);
      padding: var(--space-6) var(--space-3);
      color: var(--ink-2);
    }
    .empty-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--ink-3);
    }
    h2 {
      margin: 0;
      font-size: 1.25rem;
      line-height: 1.3;
    }
    p {
      margin: 0;
      max-width: 40ch;
    }
  `,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly message = input('');
}
