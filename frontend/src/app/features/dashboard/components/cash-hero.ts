import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { InrPipe, formatInr } from '../../../shared/money/inr.pipe';
import { AdminDashboard, PERIOD_COMPARISON, PERIOD_NOUN } from '../dashboard.models';
import { CountUp } from './count-up';
import { monthLabel } from './month-label';

export type CashSeries = 'received' | 'spent' | 'net';

const TABS: { key: CashSeries; label: string }[] = [
  { key: 'received', label: 'Received' },
  { key: 'spent', label: 'Spent' },
  { key: 'net', label: 'Net' },
];
const PAD = { top: 18, right: 14, bottom: 28, left: 14 };

/** Catmull-Rom through the points, as cubic Béziers: a smooth line that still passes every point. */
export function smoothPath(points: [number, number][]): string {
  if (points.length < 2) {
    return '';
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [points[i - 1] ?? points[i], points[i], points[i + 1], points[i + 2] ?? points[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/**
 * Cash flow hero: Received | Spent | Net tabs pick the big value and the chart series. Every amount shown
 * comes from the API as a string; Number() is used for chart geometry only.
 */
@Component({
  selector: 'app-cash-hero',
  imports: [CountUp, InrPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cash-hero.html',
  styleUrl: './cash-hero.scss',
})
export class CashHero {
  readonly data = input.required<AdminDashboard>();

  protected readonly tabs = TABS;
  protected readonly tab = signal<CashSeries>('received');
  protected readonly active = signal<number | null>(null);
  protected readonly W = signal(640);
  protected readonly monthLabel = monthLabel;
  protected readonly inr = formatInr;

  protected readonly periodNoun = computed(() => PERIOD_NOUN[this.data().period]);
  protected readonly comparison = computed(() => PERIOD_COMPARISON[this.data().period]);
  protected readonly H = computed(() => (this.W() < 480 ? 150 : 196));
  protected readonly months = computed(() => this.data().cashflow.months);

  /** The big figure for the chosen tab (API strings). */
  protected readonly value = computed(() => {
    const k = this.data().kpis;
    return this.tab() === 'received' ? k.received : this.tab() === 'spent' ? k.spent : k.net;
  });

  /** Signed delta chip, Received only; null for "All" or no baseline. */
  protected readonly delta = computed(() => {
    const pct = this.data().kpis.received_delta_pct;
    if (this.tab() !== 'received' || pct === null) {
      return null;
    }
    const negative = pct.startsWith('-');
    return { text: `${negative ? '' : '+'}${pct}%`, negative };
  });

  /** The chart series for the chosen tab (API strings). */
  protected readonly series = computed(() => {
    const c = this.data().cashflow;
    return this.tab() === 'received' ? c.collected : this.tab() === 'spent' ? c.spent : c.net;
  });

  protected readonly isEmpty = computed(() => this.series().every((v) => !Number(v)));

  private readonly scale = computed(() => {
    const nums = this.series().map((v) => Number(v) || 0);
    const min = Math.min(0, ...nums);
    const max = Math.max(0, ...nums);
    return { nums, min, span: max - min || 1 };
  });

  protected readonly points = computed<[number, number][]>(() => {
    const { nums, min, span } = this.scale();
    const innerW = this.W() - PAD.left - PAD.right;
    const innerH = this.H() - PAD.top - PAD.bottom;
    const step = nums.length > 1 ? innerW / (nums.length - 1) : 0;
    return nums.map((n, i) => [+(PAD.left + i * step).toFixed(1), +(PAD.top + innerH - ((n - min) / span) * innerH).toFixed(1)]);
  });

  protected readonly baseline = computed(() => {
    const { min, span } = this.scale();
    const innerH = this.H() - PAD.top - PAD.bottom;
    return +(PAD.top + innerH - ((0 - min) / span) * innerH).toFixed(1);
  });

  protected readonly line = computed(() => smoothPath(this.points()));
  protected readonly area = computed(() => {
    const pts = this.points();
    return pts.length > 1 ? `${this.line()} L${pts[pts.length - 1][0]},${this.baseline()} L${pts[0][0]},${this.baseline()} Z` : '';
  });
  protected readonly gridlines = computed(() => {
    const innerH = this.H() - PAD.top - PAD.bottom;
    return [0, 1, 2, 3].map((i) => +(PAD.top + (innerH / 3) * i).toFixed(1));
  });

  protected readonly tooltip = computed(() => {
    const i = this.active();
    if (i === null) {
      return null;
    }
    const c = this.data().cashflow;
    const [x, y] = this.points()[i] ?? [0, 0];
    return {
      x,
      y,
      month: monthLabel(c.months[i] ?? ''),
      received: formatInr(c.collected[i]),
      spent: formatInr(c.spent[i]),
      net: formatInr(c.net[i]),
      alignRight: x > this.W() * 0.7,
      alignLeft: x < this.W() * 0.3,
    };
  });

  protected readonly summary = computed(() => {
    const label = TABS.find((t) => t.key === this.tab())?.label ?? '';
    return `${label} per month, last ${this.months().length} months. Use the left and right arrow keys to read each month.`;
  });

  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        const width = Math.round(entry.contentRect.width);
        if (width > 0) {
          this.W.set(Math.max(width, 260));
        }
      });
      observer.observe(this.plot().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected select(tab: CashSeries): void {
    this.tab.set(tab);
  }

  protected onTabKey(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) {
      return;
    }
    event.preventDefault();
    const next = (index + delta + TABS.length) % TABS.length;
    this.select(TABS[next].key);
    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();
  }

  protected onPointer(event: PointerEvent): void {
    const rect = (event.currentTarget as Element).getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.W();
    const pts = this.points();
    let best = 0;
    pts.forEach(([px], i) => {
      if (Math.abs(px - x) < Math.abs(pts[best][0] - x)) {
        best = i;
      }
    });
    this.active.set(best);
  }

  protected onChartKey(event: KeyboardEvent): void {
    const last = this.points().length - 1;
    const current = this.active();
    const moves: Record<string, number> = {
      ArrowRight: Math.min(last, (current ?? -1) + 1),
      ArrowLeft: Math.max(0, (current ?? last + 1) - 1),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      this.active.set(moves[event.key]);
    } else if (event.key === 'Escape') {
      this.active.set(null);
    }
  }
}
