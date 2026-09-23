import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';
import { InrPipe, formatInrCompact } from '../../../shared/money/inr.pipe';
import { monthLabel } from './month-label';

const DEFAULT_W = 640;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 52 };
const GROUP_GAP = 0.34; // share of each month's slot left empty

/** Round the axis maximum up to 1, 2, 2.5 or 5 x 10^n so the gridlines land on friendly numbers. */
export function niceMax(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Revenue (collected) vs expenses (spent) per month: hand-built SVG, no chart library. */
@Component({
  selector: 'app-cashflow-chart',
  imports: [InrPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cashflow-chart.html',
  styleUrl: './cashflow-chart.scss',
})
export class CashflowChart {
  readonly months = input.required<string[]>();
  readonly collected = input.required<string[]>();
  readonly spent = input.required<string[]>();

  /** Drawn at its real pixel width (not scaled), so axis text stays 11px at every screen size. */
  protected readonly W = signal(DEFAULT_W);
  protected readonly H = H;
  protected readonly PAD = PAD;
  protected readonly monthLabel = monthLabel;

  protected readonly isEmpty = computed(() =>
    [...this.collected(), ...this.spent()].every((v) => !Number(v)),
  );

  private readonly max = computed(() =>
    niceMax(Math.max(...this.collected().map(Number), ...this.spent().map(Number), 0)),
  );

  protected readonly gridlines = computed(() =>
    [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: this.y(this.max() * f),
      label: formatInrCompact(String(Math.round(this.max() * f))),
    })),
  );

  protected readonly bars = computed(() => {
    const slot = (this.W() - PAD.left - PAD.right) / Math.max(this.months().length, 1);
    const barW = (slot * (1 - GROUP_GAP)) / 2;
    return this.months().map((month, i) => {
      const x0 = PAD.left + i * slot + (slot * GROUP_GAP) / 2;
      const c = Number(this.collected()[i]) || 0;
      const s = Number(this.spent()[i]) || 0;
      return {
        month,
        labelX: PAD.left + i * slot + slot / 2,
        collected: { x: x0, y: this.y(c), w: barW, h: this.y(0) - this.y(c) },
        spent: { x: x0 + barW, y: this.y(s), w: barW, h: this.y(0) - this.y(s) },
      };
    });
  });

  protected readonly summary = computed(() => {
    if (this.isEmpty()) {
      return 'Revenue vs expenses, last 6 months: no data for this period.';
    }
    const total = (values: string[]) => values.reduce((sum, v) => sum + (Number(v) || 0), 0);
    return (
      `Revenue vs expenses, last ${this.months().length} months. ` +
      `Collected ${formatInrCompact(String(Math.round(total(this.collected()))))} in total, ` +
      `spent ${formatInrCompact(String(Math.round(total(this.spent()))))}. Full figures in the table below.`
    );
  });

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width > 0) {
        this.W.set(Math.max(width, 280));
      }
    });
    observer.observe(host);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  private y(value: number): number {
    const inner = H - PAD.top - PAD.bottom;
    return +(PAD.top + inner - (value / this.max()) * inner).toFixed(2);
  }
}
