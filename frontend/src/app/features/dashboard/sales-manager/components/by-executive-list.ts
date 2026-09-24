import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InrCompactPipe } from '../../../../shared/money/inr.pipe';
import { LeadAvatar } from '../../../leads/components/lead-bits';
import { PanelHead } from '../../components/panel-head';
import { ExecRow, OVERDUE_HIGHLIGHT_THRESHOLD } from '../sales-manager-dashboard.models';

/**
 * Ranked by workload (open leads + overdue*2), highest first. Aligned columns under one header row.
 * An exec past the overdue threshold is highlighted - a signal to look, never a verdict
 * ("overdue > 3", nothing harsher).
 */
@Component({
  selector: 'app-by-executive-list',
  imports: [InrCompactPipe, LeadAvatar, PanelHead, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'by-exec-title' },
  template: `
    <app-panel-head title="By executive" subtitle="Ranked by workload" headingId="by-exec-title" />
    @if (ranked().length) {
      <div class="grid head" aria-hidden="true">
        <span></span>
        <span>Executive</span>
        <span class="r opt">Open</span>
        <span class="r opt">Overdue</span>
        <span class="r">Won value</span>
      </div>
      <ol>
        @for (row of ranked(); track row.id; let i = $index) {
          <li [class.hot]="row.overdue > threshold">
            <a class="grid" [routerLink]="['/leads/all']" [queryParams]="{ assigned_to: row.id }">
              <span class="rk num">{{ i + 1 }}</span>
              <span class="who">
                <app-lead-avatar [name]="row.name" [size]="32" />
                <span class="who-t">
                  <span class="nm-line">
                    <span class="nm">{{ row.name }}</span>
                    @if (row.overdue > threshold) {
                      <span class="flag">overdue &gt; {{ threshold }}</span>
                    }
                  </span>
                  <span class="track" aria-hidden="true"><span [style.width.%]="loadShare(row)"></span></span>
                </span>
              </span>
              <span class="r opt num">{{ row.open_leads }}</span>
              <span class="r opt num" [class.rose]="row.overdue > 0">{{ row.overdue }}</span>
              <span class="r fig">
                <b class="num">{{ row.won_value | inrCompact }}</b>
                <small>{{ row.won_count }} won · {{ row.conversion_pct }}%</small>
              </span>
            </a>
          </li>
        }
      </ol>
      <p class="foot">
        {{ ranked().length }} {{ ranked().length === 1 ? 'executive' : 'executives' }} ·
        <b class="num">{{ totals().open }}</b> open ·
        <b class="num">{{ totals().overdue }}</b> overdue ·
        <b class="num">{{ totals().won }}</b> won
      </p>
    } @else {
      <p class="none">No sales executives yet. Add one from Team management.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      container-type: inline-size;
    }
    .grid {
      display: grid;
      grid-template-columns: 20px minmax(0, 1fr) 56px 64px 104px;
      align-items: center;
      column-gap: 12px;
    }
    .head {
      padding: 0 12px 8px;
      border-bottom: 1px solid var(--line);
      color: var(--ink-3);
      font-size: var(--text-xs);
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .r {
      text-align: right;
    }
    ol {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      border-bottom: 1px solid var(--line);
    }
    li:last-child {
      border-bottom: 0;
    }
    li a {
      min-height: 64px;
      padding: 8px 12px;
      border-left: 3px solid transparent;
      color: var(--ink-2);
      text-decoration: none;
      transition: background-color var(--dur-fast) ease;
    }
    li a:hover {
      background: var(--surface-2);
    }
    li a:focus-visible {
      outline: 2px solid var(--brand-deep);
      outline-offset: -2px;
    }
    li.hot a {
      border-left-color: var(--data-amber);
      background: color-mix(in srgb, var(--tint-amber) 60%, transparent);
    }
    .rk {
      color: var(--ink-3);
      font-weight: 600;
      text-align: center;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .who-t {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      gap: 6px;
    }
    .nm-line {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .nm {
      overflow: hidden;
      color: var(--ink);
      font-size: var(--text-sm);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .flag {
      flex: none;
      padding: 1px 8px;
      border-radius: var(--radius-pill);
      background: var(--tint-amber);
      color: var(--tint-amber-ink);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .track {
      max-width: 160px;
      height: 4px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--plate);
    }
    .track span {
      display: block;
      height: 100%;
      background: var(--data-cyan);
      transform-origin: left;
      animation: fill 800ms var(--ease-out) both;
    }
    .hot .track span {
      background: var(--data-amber);
    }
    .num {
      color: var(--ink);
      font-weight: 600;
    }
    .rose {
      color: var(--tint-rose-ink);
    }
    .fig {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      font-size: var(--text-sm);
    }
    .fig small {
      color: var(--ink-3);
      font-size: var(--text-xs);
      white-space: nowrap;
    }
    .foot {
      margin: auto 0 0;
      padding: 12px 12px 0;
      border-top: 1px solid var(--line);
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .foot b {
      color: var(--ink);
    }
    .none {
      margin: 0;
      padding: 32px 8px;
      color: var(--ink-3);
      text-align: center;
    }
    @keyframes fill {
      from {
        transform: scaleX(0);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .track span {
        animation: none;
      }
    }
    /* Narrow card: keep name and won value, drop the open/overdue columns. */
    @container (max-width: 480px) {
      .grid {
        grid-template-columns: 20px minmax(0, 1fr) 96px;
      }
      .opt {
        display: none;
      }
    }
  `,
})
export class ByExecutiveList {
  readonly rows = input.required<ExecRow[]>();
  protected readonly threshold = OVERDUE_HIGHLIGHT_THRESHOLD;
  protected readonly ranked = computed(() => [...this.rows()].sort((a, b) => b.load_score - a.load_score));
  protected readonly maxLoad = computed(() => Math.max(1, ...this.ranked().map((r) => r.load_score)));
  /** Counts only - money is never summed in the browser. */
  protected readonly totals = computed(() =>
    this.ranked().reduce(
      (t, r) => ({ open: t.open + r.open_leads, overdue: t.overdue + r.overdue, won: t.won + r.won_count }),
      { open: 0, overdue: 0, won: 0 },
    ),
  );

  protected loadShare(row: ExecRow): number {
    return Math.min(100, (row.load_score / this.maxLoad()) * 100);
  }
}
