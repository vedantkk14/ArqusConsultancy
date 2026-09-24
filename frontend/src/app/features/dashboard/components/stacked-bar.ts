import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarSegment {
  label: string;
  /** Geometry only (a count, or Number() of an API amount). */
  value: number;
  /** A colour token name, e.g. 'data-cyan'. */
  color: string;
}

/** One horizontal stacked bar. Decorative: every segment is also listed with its label and figure. */
@Component({
  selector: 'app-stacked-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @for (s of parts(); track s.label) {
      <span [style.flex-grow]="s.value" [style.background]="'var(--' + s.color + ')'" [attr.title]="s.label"></span>
    } @empty {
      <span class="empty"></span>
    }
  `,
  styles: `
    :host {
      display: flex;
      gap: 2px;
      height: var(--bar-h, 10px);
      overflow: hidden;
      border-radius: 999px;
      background: var(--line);
    }
    span {
      min-width: 3px;
      flex-basis: 0;
      transition: flex-grow var(--dur-base) var(--ease-out);
    }
    .empty {
      flex-grow: 1;
      background: var(--line);
    }
  `,
})
export class StackedBar {
  readonly segments = input.required<BarSegment[]>();
  protected readonly parts = computed(() => this.segments().filter((s) => s.value > 0));
}
