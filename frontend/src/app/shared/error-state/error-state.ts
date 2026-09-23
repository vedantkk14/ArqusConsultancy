import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** "Something went wrong" card with a retry button. */
@Component({
  selector: 'app-error-state',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error card" role="alert">
      <mat-icon class="icon" aria-hidden="true">error_outline</mat-icon>
      <h2>{{ title() }}</h2>
      <p>{{ message() }}</p>
      <button matButton="outlined" type="button" (click)="retry.emit()">
        <mat-icon aria-hidden="true">refresh</mat-icon>
        Try again
      </button>
    </div>
  `,
  styles: `
    .error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 40px 20px;
      text-align: center;
    }
    .icon {
      width: 24px;
      height: 24px;
      margin-bottom: 4px;
      font-size: 24px;
      color: var(--negative);
    }
    h2 {
      font-size: var(--text-md);
    }
    p {
      max-width: 48ch;
      margin: 0 0 10px;
      color: var(--ink-3);
    }
  `,
})
export class ErrorState {
  readonly title = input("Couldn't load this");
  readonly message = input('Check your connection and try again.');
  readonly retry = output<void>();
}
