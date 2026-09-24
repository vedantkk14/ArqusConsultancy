import { DestroyRef, Directive, ElementRef, effect, inject, input, untracked } from '@angular/core';
import { formatInr } from '../../../shared/money/inr.pipe';

export type CountFormat = 'int' | 'inr';

const DURATION_MS = 500;

function format(value: string | number, kind: CountFormat): string {
  return kind === 'inr' ? formatInr(value) : Number(value).toLocaleString('en-IN');
}

function prefersMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    typeof requestAnimationFrame === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Writes a KPI value into its element, counting up from 0 over 500ms the first time it renders.
 * Later changes (another period) are written straight away. The final frame is always the exact
 * formatted value; the in-between frames are display-only approximations.
 * No animation when the user prefers reduced motion.
 */
@Directive({ selector: '[appCountUp]' })
export class CountUp {
  readonly appCountUp = input.required<string | number>();
  readonly countFormat = input<CountFormat>('int');

  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private frame = 0;
  private animated = false;

  constructor() {
    effect(() => {
      const value = this.appCountUp();
      const kind = this.countFormat();
      untracked(() => this.render(value, kind));
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame?.(this.frame));
  }

  private render(value: string | number, kind: CountFormat): void {
    const target = Number(value) || 0;
    if (this.animated || target === 0 || !prefersMotion()) {
      this.animated = true;
      this.el.textContent = format(value, kind);
      return;
    }
    this.animated = true;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      this.el.textContent = t < 1 ? format(Math.round(target * eased), kind) : format(value, kind);
      if (t < 1) {
        this.frame = requestAnimationFrame(tick);
      }
    };
    this.el.textContent = format(0, kind);
    this.frame = requestAnimationFrame(tick);
  }
}
