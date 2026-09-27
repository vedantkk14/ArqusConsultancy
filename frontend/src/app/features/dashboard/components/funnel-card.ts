import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { FunnelStage } from '../dashboard.models';
import { PanelHead } from './panel-head';

/**
 * Open pipeline as a funnel: one lane per stage with a narrowing bar (geometry only), the stage name,
 * its value (API string) and the conversion from the previous stage. Won and Lost are summary tiles.
 */
@Component({
  selector: 'app-funnel-card',
  imports: [InrCompactPipe, MatIconModule, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'funnel-title' },
  template: `
    <app-panel-head title="Lead funnel" subtitle="Open pipeline by stage" [link]="link()" headingId="funnel-title" />
    @if (open().length) {
      <ol>
        @for (s of open(); track s.status; let i = $index) {
          <li>
            <span class="who">
              <strong>{{ s.label }}</strong>
              <span class="val num">{{ s.value | inrCompact }}</span>
            </span>
            <span class="lane" aria-hidden="true">
              <span class="bar" [class]="'bar s' + i" [style.width.%]="s.width"><span class="n num">{{ s.count }}</span></span>
            </span>
            <span class="conv">
              @if (i === 0) {
                <span class="tag start">Top of funnel</span>
              } @else {
                <span class="tag"><mat-icon aria-hidden="true">south</mat-icon>{{ s.conv }}% <span class="of">of previous</span></span>
              }
            </span>
            <span class="sr-only">{{ s.count }} leads</span>
          </li>
        }
      </ol>
      <div class="ends">
        <span class="end won">
          <mat-icon aria-hidden="true">emoji_events</mat-icon>
          <span><b class="num">{{ won() }}</b> Won</span>
        </span>
        <span class="end lost">
          <mat-icon aria-hidden="true">block</mat-icon>
          <span><b class="num">{{ lost() }}</b> Lost</span>
        </span>
      </div>
    } @else {
      <p class="none">No data for this period</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; container-type: inline-size; }
    ol { display: flex; flex: 1; flex-direction: column; gap: 14px; margin: 0; padding: 0; list-style: none; }
    li { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'who conv' 'lane lane'; gap: 8px 12px; align-items: center; }
    .who { grid-area: who; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .who strong { color: var(--ink); font-size: var(--text-sm); font-weight: 600; }
    .val { color: var(--ink-3); font-size: var(--text-sm); }
    .conv { grid-area: conv; }
    .lane { grid-area: lane; display: flex; justify-content: center; height: 40px; border-radius: 12px; background: var(--surface-2); }
    .bar {
      display: flex; align-items: center; justify-content: center; min-width: 52px; height: 100%; border-radius: 12px;
      color: var(--ink); animation: grow 700ms var(--ease-out) both;
    }
    .s0 { background: var(--grad-ink); color: var(--on-ink); }
    .s1 { background: var(--data-cyan); }
    .s2 { background: color-mix(in srgb, var(--data-cyan) 62%, var(--tint-cyan)); }
    .s3 { background: color-mix(in srgb, var(--data-cyan) 38%, var(--tint-cyan)); }
    .n { font-size: var(--text-base); font-weight: 600; }
    .tag {
      display: inline-flex; align-items: center; gap: 2px; height: 24px; padding: 0 10px 0 6px; border-radius: var(--radius-pill);
      background: var(--tint-cyan); color: var(--tint-cyan-ink); font-size: var(--text-xs); font-weight: 600; white-space: nowrap;
    }
    .tag mat-icon { width: 14px; height: 14px; font-size: 14px; }
    .tag .of { margin-left: 3px; font-weight: 400; }
    .tag.start { padding: 0 10px; background: var(--tint-slate); color: var(--tint-slate-ink); }
    .ends { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: var(--space-5); }
    .end { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 14px; border-radius: var(--radius-control); font-size: var(--text-sm); }
    .end b { margin-right: 4px; font-size: var(--text-lg); font-weight: 600; }
    .end mat-icon { width: 22px; height: 22px; font-size: 22px; }
    .won { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .lost { background: var(--tint-rose); color: var(--tint-rose-ink); }
    .none { color: var(--ink-3); }
    @keyframes grow { from { transform: scaleX(0.3); opacity: 0; } }
    @container (min-width: 520px) {
      li { grid-template-columns: 110px minmax(0, 1fr) auto; grid-template-areas: 'who lane conv'; gap: 14px; }
      li { flex: 1 1 0; align-items: stretch; min-height: 44px; max-height: 76px; }
      .lane { height: auto; }
      .who { flex-direction: column; align-items: flex-start; align-self: center; gap: 0; }
      .conv { align-self: center; min-width: 150px; text-align: right; }
    }
  `,
})
export class FunnelCard {
  readonly stages = input.required<FunnelStage[]>();
  /** "View all" target; null on the report page itself. */
  readonly link = input<string | null>('/reports/lead-funnel');
  readonly won = input(0);
  readonly lost = input(0);

  protected readonly open = computed(() => {
    const stages = this.stages().filter((s) => s.status !== 'WON' && s.status !== 'LOST');
    const max = Math.max(1, ...stages.map((s) => s.count));
    return stages.map((s, i) => {
      const prev = stages[i - 1]?.count ?? 0;
      return { ...s, width: Math.max(16, Math.round((s.count / max) * 100)), conv: prev ? Math.round((s.count / prev) * 100) : 0 };
    });
  });
}
