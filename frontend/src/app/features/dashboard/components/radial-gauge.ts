import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Single-value progress ring (not a donut chart). `pct` is the API's percentage string; Number() is used
 * for the ring geometry only. The value is written in the centre, so the ring is never the only signal.
 * Draws in once (stroke-dashoffset); instant under reduced motion.
 */
@Component({
  selector: 'app-radial-gauge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'ariaLabel()', '[style.--size.px]': 'size()' },
  template: `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="track" cx="50" cy="50" r="42" pathLength="100" />
      <circle
        class="value"
        [class]="'value tone-' + tone()"
        cx="50"
        cy="50"
        r="42"
        pathLength="100"
        [style.stroke-dashoffset]="100 - clamped()"
      />
    </svg>
    <span class="centre">
      <strong>{{ centre() }}</strong>
      @if (caption()) {
        <small>{{ caption() }}</small>
      }
    </span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-grid;
      width: var(--size, 88px);
      height: var(--size, 88px);
      flex: none;
      place-items: center;
    }
    svg {
      position: absolute;
      inset: 0;
      transform: rotate(-90deg);
    }
    circle {
      fill: none;
      stroke-width: 9;
      stroke-linecap: round;
    }
    .track {
      stroke: var(--line);
    }
    .value {
      stroke-dasharray: 100;
      animation: draw 900ms var(--ease-out) both;
    }
    .tone-cyan {
      stroke: var(--brand);
    }
    .tone-teal {
      stroke: var(--data-teal);
    }
    .tone-amber {
      stroke: var(--data-amber);
    }
    @keyframes draw {
      from {
        stroke-dashoffset: 100;
      }
    }
    .centre {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1.1;
    }
    strong {
      color: var(--ink);
      font-size: calc(var(--size, 88px) * 0.2);
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    small {
      color: var(--ink-3);
      font-size: 11px;
    }
  `,
})
export class RadialGauge {
  /** Percentage string from the API, e.g. "62.4". */
  readonly pct = input.required<string>();
  readonly caption = input('');
  readonly size = input(88);
  readonly tone = input<'cyan' | 'teal' | 'amber'>('cyan');
  readonly label = input('');

  protected readonly clamped = computed(() => Math.max(0, Math.min(100, Number(this.pct()) || 0)));
  protected readonly centre = computed(() => `${this.pct().replace(/\.0$/, '')}%`);
  protected readonly ariaLabel = computed(() => `${this.centre()} ${this.label() || this.caption()}`.trim());
}
