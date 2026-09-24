import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { FunnelStage } from '../dashboard.models';
import { PanelHead } from './panel-head';

/** Centred narrowing bars: count, value and conversion from the previous stage. Won / Lost are end caps. */
@Component({
  selector: 'app-funnel-card',
  imports: [InrCompactPipe, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'funnel-title' },
  template: `
    <app-panel-head title="Lead funnel" subtitle="Open pipeline by stage" link="/reports/lead-funnel" headingId="funnel-title" />
    @if (open().length) {
      <ol>
        @for (s of open(); track s.status; let i = $index) {
          <li>
            <span class="lane"><span class="bar" [style.width.%]="s.width"><span class="n num">{{ s.count }}</span></span></span>
            <span class="meta">
              <strong>{{ s.label }}</strong>
              <span class="num">{{ s.value | inrCompact }}</span>
              <span class="conv">{{ i === 0 ? 'Top of funnel' : s.conv + '% of previous' }}</span>
            </span>
          </li>
        }
      </ol>
      <p class="caps">
        <span class="chip won">Won <b class="num">{{ won() }}</b></span>
        <span class="chip lost">Lost <b class="num">{{ lost() }}</b></span>
      </p>
    } @else {
      <p class="none">No data for this period</p>
    }
  `,
  styles: `
    ol { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
    li { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); align-items: center; gap: 12px; }
    .lane { display: flex; justify-content: center; }
    .bar {
      display: flex; align-items: center; justify-content: center;
      min-width: 40px; height: 32px; border-radius: 8px; background: var(--brand-tint); color: var(--ink);
      animation: grow 700ms var(--ease-out) both;
    }
    li:first-child .bar { background: var(--ink); color: var(--on-ink); }
    .n { font-size: var(--text-sm); font-weight: 600; }
    .meta { display: flex; min-width: 0; flex-direction: column; color: var(--ink-2); font-size: var(--text-sm); line-height: 1.3; }
    strong { color: var(--ink); font-weight: 600; }
    .conv { color: var(--ink-3); font-size: var(--text-xs); }
    .caps { display: flex; gap: 8px; margin: 16px 0 0; }
    .chip { padding: 4px 12px; border-radius: 999px; font-size: var(--text-sm); }
    .won { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .lost { background: var(--tint-rose); color: var(--tint-rose-ink); }
    .none { color: var(--ink-3); }
    @keyframes grow { from { transform: scaleX(0.2); opacity: 0; } }
  `,
})
export class FunnelCard {
  readonly stages = input.required<FunnelStage[]>();
  readonly won = input(0);
  readonly lost = input(0);

  protected readonly open = computed(() => {
    const stages = this.stages().filter((s) => s.status !== 'WON' && s.status !== 'LOST');
    const max = Math.max(1, ...stages.map((s) => s.count));
    return stages.map((s, i) => {
      const prev = stages[i - 1]?.count ?? 0;
      return { ...s, width: Math.max(14, Math.round((s.count / max) * 100)), conv: prev ? Math.round((s.count / prev) * 100) : 0 };
    });
  });
}
