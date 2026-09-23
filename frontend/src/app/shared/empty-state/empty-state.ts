import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Centered icon + title + message on a white card. Project content into it for action buttons. */
@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty card">
      <span class="empty-icon"><mat-icon aria-hidden="true">{{ icon() }}</mat-icon></span>
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
      display: grid;
      place-items: center;
      width: 72px;
      height: 72px;
      margin-bottom: var(--space-2);
      border-radius: 50%;
      background: var(--brand-tint);
      color: var(--ink);
    }
    .empty-icon mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }
    h2 {
      margin: 0;
      font-size: 1.25rem;
      line-height: 1.3;
    }
    p {
      margin: 0;
      max-width: 42ch;
    }
  `,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly message = input('');
}
