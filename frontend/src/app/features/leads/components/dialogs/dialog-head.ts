import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

/** Title, one muted line and a close (X) button. Every leads dialog starts with this. */
@Component({
  selector: 'app-dialog-head',
  imports: [MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="t">
      <h2 mat-dialog-title>{{ title() }}</h2>
      @if (subtitle()) {
        <p>{{ subtitle() }}</p>
      }
    </div>
    <button type="button" class="x" mat-dialog-close aria-label="Close">
      <mat-icon aria-hidden="true">close</mat-icon>
    </button>
  `,
  styles: `
    :host { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: var(--space-5); }
    .t { min-width: 0; }
    h2 { margin: 0; padding: 0; font-size: var(--text-lg); font-weight: 600; }
    h2::before { display: none; }
    p { margin: 2px 0 0; color: var(--ink-3); font-size: var(--text-sm); overflow-wrap: anywhere; }
    .x {
      display: grid; width: 40px; height: 40px; flex: none; margin: -6px -8px 0 0; place-items: center;
      border: 0; border-radius: 50%; background: transparent; color: var(--ink-2); cursor: pointer;
    }
    .x:hover { background: var(--subtle); color: var(--ink); }
    .x mat-icon { width: 22px; height: 22px; font-size: 22px; }
  `,
})
export class DialogHead {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
