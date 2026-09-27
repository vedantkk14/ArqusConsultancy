import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let nextId = 0;

/** Values -> SVG points in a 100 x 32 box. Numbers are used for geometry only, never for display. */
export function sparkPoints(values: (string | number)[], width = 100, height = 32, pad = 2): [number, number][] {
  const nums = values.map((v) => Number(v) || 0);
  if (nums.length === 0) {
    return [];
  }
  const max = Math.max(...nums);
  const min = Math.min(...nums, 0);
  const span = max - min || 1;
  const step = nums.length > 1 ? width / (nums.length - 1) : 0;
  return nums.map((n, i) => [+(i * step).toFixed(2), +(height - pad - ((n - min) / span) * (height - pad * 2)).toFixed(2)]);
}

/** Small cyan trend line with a faint fill underneath. */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" [attr.aria-label]="label()">
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" class="s0" />
          <stop offset="100%" class="s1" />
        </linearGradient>
        <clipPath [attr.id]="clipId"><rect class="reveal" x="-2" y="-4" width="104" height="40" /></clipPath>
      </defs>
      @if (line()) {
        <g [attr.clip-path]="'url(#' + clipId + ')'">
          <path [attr.d]="area()" [attr.fill]="'url(#' + gradientId + ')'" />
          <path class="ln" [attr.d]="line()" fill="none" stroke-width="2" stroke-linejoin="round"
                stroke-linecap="round" vector-effect="non-scaling-stroke" />
        </g>
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      height: var(--spark-h, 40px);
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .s0 {
      stop-color: var(--data-cyan);
      stop-opacity: 0.14;
    }
    .s1 {
      stop-color: var(--data-cyan);
      stop-opacity: 0;
    }
    .ln {
      stroke: var(--data-cyan);
    }
    /* One-time draw-in, left to right (transform only). */
    .reveal {
      transform-origin: 0 0;
      animation: reveal 900ms var(--ease-out) both;
    }
    @keyframes reveal {
      from {
        transform: scaleX(0);
      }
    }
  `,
})
export class Sparkline {
  readonly values = input.required<(string | number)[]>();
  /** Accessible summary, e.g. "Received per month: Apr ₹9.8L, …". */
  readonly label = input.required<string>();

  protected readonly gradientId = `spark-${nextId++}`;
  protected readonly clipId = `${this.gradientId}-clip`;
  private readonly points = computed(() => sparkPoints(this.values()));
  protected readonly line = computed(() => {
    const pts = this.points();
    return pts.length > 1 ? 'M' + pts.map(([x, y]) => `${x},${y}`).join(' L') : '';
  });
  protected readonly area = computed(() => {
    const pts = this.points();
    return pts.length > 1 ? `${this.line()} L100,32 L0,32 Z` : '';
  });
}
