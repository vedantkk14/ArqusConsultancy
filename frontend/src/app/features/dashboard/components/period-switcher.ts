import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PERIODS, PERIOD_LABELS, Period } from '../dashboard.models';

/** Segmented Month / Quarter / Year / All control. Each option is a toggle button (aria-pressed). */
@Component({
  selector: 'app-period-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', 'aria-label': 'Period' },
  template: `
    @for (p of periods; track p) {
      <button type="button" [class.on]="value() === p" [attr.aria-pressed]="value() === p" (click)="changed.emit(p)">
        {{ labels[p] }}
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      padding: 3px;
      border: 1px solid var(--line);
      border-radius: var(--radius-control);
      background: var(--surface);
    }
    button {
      flex: 1;
      height: 32px;
      padding: 0 14px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--ink-3);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 500;
      cursor: pointer;
      transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease;
    }
    button:hover {
      color: var(--ink);
    }
    button.on {
      background: var(--brand-tint);
      color: var(--ink);
      font-weight: 600;
      box-shadow: inset 0 0 0 1px rgba(8, 111, 146, 0.2);
    }
  `,
})
export class PeriodSwitcher {
  readonly value = input.required<Period>();
  readonly changed = output<Period>();

  protected readonly periods = PERIODS;
  protected readonly labels = PERIOD_LABELS;
}
