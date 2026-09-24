import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InrCompactPipe } from '../../../../shared/money/inr.pipe';
import { LeadAvatar } from '../../../leads/components/lead-bits';
import { PanelHead } from '../../components/panel-head';
import { ExecRow, OVERDUE_HIGHLIGHT_THRESHOLD } from '../sales-manager-dashboard.models';

/**
 * Ranked by workload (open leads + overdue*2), highest first - same rank/avatar/track-bar
 * pattern as the admin dashboard's leaderboard-card. An exec past the overdue threshold is
 * highlighted, a signal to look, never a verdict ("overdue > 3", nothing harsher).
 */
@Component({
  selector: 'app-by-executive-list',
  imports: [InrCompactPipe, LeadAvatar, PanelHead, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'by-exec-title' },
  template: `
    <app-panel-head title="By executive" subtitle="Ranked by workload" headingId="by-exec-title" />
    <ol>
      @for (row of ranked(); track row.id; let i = $index) {
        <li [class.first]="i === 0" [class.hot]="row.overdue > threshold">
          <span class="rk num">{{ i + 1 }}</span>
          <a class="who" [routerLink]="['/leads/all']" [queryParams]="{ assigned_to: row.id }">
            <app-lead-avatar [name]="row.name" [size]="32" />
            <span class="who-t">
              <span class="nm">{{ row.name }}</span>
              <span class="track" aria-hidden="true"><span [style.width.%]="loadShare(row)"></span></span>
            </span>
          </a>
          <span class="stats">
            <span class="st"><b class="num">{{ row.open_leads }}</b><small>open</small></span>
            <span class="st" [class.rose]="row.overdue > 0"><b class="num">{{ row.overdue }}</b><small>overdue</small></span>
            <span class="fig">
              <b class="num">{{ row.won_value | inrCompact }}</b>
              <small>{{ row.won_count }} won · {{ row.conversion_pct }}%</small>
            </span>
          </span>
        </li>
      } @empty {
        <li class="none">No sales executives yet. Add one from Team management.</li>
      }
    </ol>
  `,
  styles: `
    ol {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0 -8px;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 60px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
    }
    .first {
      background: var(--tint-cyan);
    }
    .hot {
      background: var(--tint-amber);
    }
    .rk {
      width: 18px;
      color: var(--ink-3);
      font-weight: 600;
      text-align: center;
    }
    .first .rk {
      color: var(--tint-cyan-ink);
    }
    .who {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 10px;
      min-width: 0;
      color: inherit;
      text-decoration: none;
    }
    .who-t {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 6px;
    }
    .nm {
      overflow: hidden;
      color: var(--ink);
      font-size: var(--text-sm);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .track {
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
    .stats {
      display: flex;
      flex: none;
      align-items: center;
      gap: 16px;
    }
    .st {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      color: var(--ink-2);
      font-size: var(--text-sm);
    }
    .st.rose b {
      color: var(--tint-rose-ink);
    }
    .st small {
      color: var(--ink-3);
      font-size: 10px;
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
    .none {
      padding: 24px 8px;
      color: var(--ink-3);
      text-align: center;
    }
    @keyframes fill {
      from {
        transform: scaleX(0);
      }
    }
    @media (max-width: 640px) {
      .stats {
        gap: 10px;
      }
      .st {
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

  protected loadShare(row: ExecRow): number {
    return Math.min(100, (row.load_score / this.maxLoad()) * 100);
  }
}
