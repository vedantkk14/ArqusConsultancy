import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';
import { ExecSales } from '../dashboard.models';
import { PanelHead } from './panel-head';

/** Sales leaderboard: rank, person, won value, share bar and win rate. Top five. */
@Component({
  selector: 'app-leaderboard-card',
  imports: [InrCompactPipe, PanelHead, UserAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'board-title' },
  template: `
    <app-panel-head title="Leaderboard" [subtitle]="'Won value ' + periodNoun()" link="/reports/sales" headingId="board-title" />
    <ol>
      @for (s of top(); track s.user_id; let i = $index) {
        <li [class.first]="i === 0">
          <span class="rk num">{{ i + 1 }}</span>
          <app-user-avatar [name]="s.name" [size]="32" />
          <span class="who">
            <span class="nm">{{ s.name }}</span>
            <span class="track" aria-hidden="true"><span [style.width.%]="share(s.share_pct)"></span></span>
          </span>
          <span class="fig">
            <b class="num">{{ s.won_value | inrCompact }}</b>
            <small>{{ s.win_rate_pct }}% win rate</small>
          </span>
        </li>
      } @empty {
        <li class="none">No data for this period</li>
      }
    </ol>
  `,
  styles: `
    ol { display: flex; flex-direction: column; gap: 4px; margin: 0 -8px; padding: 0; list-style: none; }
    li { display: flex; min-height: 52px; align-items: center; gap: 10px; padding: 6px 8px; border-radius: var(--radius-sm); }
    .first { background: var(--tint-cyan); }
    .rk { width: 18px; color: var(--ink-3); font-weight: 600; text-align: center; }
    .first .rk, .first small { color: var(--tint-cyan-ink); }
    .who { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6px; }
    .nm { overflow: hidden; color: var(--ink); font-size: var(--text-sm); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
    .track { height: 4px; overflow: hidden; border-radius: 999px; background: var(--plate); }
    .track span { display: block; height: 100%; background: var(--data-cyan); transform-origin: left; animation: fill 800ms var(--ease-out) both; }
    .fig { display: flex; flex-direction: column; align-items: flex-end; font-size: var(--text-sm); }
    small { color: var(--ink-3); font-size: var(--text-xs); }
    .none { color: var(--ink-3); }
    @keyframes fill { from { transform: scaleX(0); } }
  `,
})
export class LeaderboardCard {
  readonly rows = input.required<ExecSales[]>();
  readonly periodNoun = input('');
  protected readonly top = computed(() => this.rows().slice(0, 5));

  /** Bar geometry only. */
  protected share(pct: string): number {
    return Math.min(100, Number(pct) || 0);
  }
}
