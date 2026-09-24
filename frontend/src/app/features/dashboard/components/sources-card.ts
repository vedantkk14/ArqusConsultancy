import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LeadSource } from '../dashboard.models';
import { PanelHead } from './panel-head';
import { BarSegment, StackedBar } from './stacked-bar';

const COLORS = ['data-cyan', 'data-ink', 'data-teal', 'data-amber', 'data-orange', 'data-slate'];

/** Where leads come from: one stacked bar plus the full list (the list carries the meaning). */
@Component({
  selector: 'app-sources-card',
  imports: [PanelHead, StackedBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'sources-title' },
  template: `
    <app-panel-head title="Lead sources" subtitle="Share of new leads" headingId="sources-title" />
    @if (rows().length) {
      <app-stacked-bar [segments]="segments()" style="--bar-h: 12px" />
      <ul>
        @for (s of rows(); track s.source; let i = $index) {
          <li>
            <i [style.background]="'var(--' + color(i) + ')'"></i>
            <span class="nm">{{ s.source }}</span>
            <span class="num">{{ s.count }}</span>
            <span class="num pct">{{ s.pct }}%</span>
          </li>
        }
      </ul>
    } @else {
      <p class="none">No data for this period</p>
    }
  `,
  styles: `
    ul { display: flex; flex-direction: column; margin: 12px 0 0; padding: 0; list-style: none; }
    li { display: flex; min-height: 36px; align-items: center; gap: 10px; color: var(--ink-2); font-size: var(--text-sm); }
    li + li { border-top: 1px solid var(--line); }
    i { width: 10px; height: 10px; flex: none; border-radius: 3px; }
    .nm { min-width: 0; flex: 1; color: var(--ink); }
    .pct { width: 52px; color: var(--ink-3); text-align: right; }
    .none { color: var(--ink-3); }
  `,
})
export class SourcesCard {
  readonly rows = input.required<LeadSource[]>();

  protected color(i: number): string {
    return COLORS[i % COLORS.length];
  }

  protected readonly segments = computed<BarSegment[]>(() =>
    this.rows().map((s, i) => ({ label: s.source, value: s.count, color: this.color(i) })),
  );
}
