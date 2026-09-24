import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { AgingBucket, OverdueClient } from '../dashboard.models';
import { PanelHead } from './panel-head';
import { BarSegment, StackedBar } from './stacked-bar';

const BUCKET_COLORS: Record<AgingBucket['bucket'], string> = {
  '0-30': 'data-cyan',
  '31-60': 'data-amber',
  '61-90': 'data-orange',
  '90+': 'data-rose',
};

/** Outstanding money by age, plus the three most overdue clients. */
@Component({
  selector: 'app-aging-card',
  imports: [InrCompactPipe, PanelHead, StackedBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'aging-title' },
  template: `
    <app-panel-head title="Collections aging" subtitle="Outstanding by days due" link="/accounts/pending" headingId="aging-title" />
    <app-stacked-bar [segments]="segments()" style="--bar-h: 12px" />
    <dl>
      @for (b of buckets(); track b.bucket) {
        <div>
          <dt><i [style.background]="'var(--' + colors[b.bucket] + ')'"></i>{{ b.bucket }} days</dt>
          <dd><b class="num">{{ b.amount | inrCompact }}</b><small>{{ b.count }} {{ b.count === 1 ? 'invoice' : 'invoices' }}</small></dd>
        </div>
      }
    </dl>
    @if (clients().length) {
      <h3>Most overdue</h3>
      <ul>
        @for (c of clients().slice(0, 3); track c.ledger_id) {
          <li><span class="nm">{{ c.client }}</span><span class="d">{{ c.days }} days</span><b class="num">{{ c.outstanding | inrCompact }}</b></li>
        }
      </ul>
    }
  `,
  styles: `
    dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 14px 0 0; }
    dt { display: flex; align-items: center; gap: 6px; color: var(--ink-3); font-size: var(--text-xs); }
    i { width: 8px; height: 8px; border-radius: 2px; }
    dd { display: flex; flex-direction: column; margin: 2px 0 0; font-size: var(--text-sm); }
    small { color: var(--ink-3); font-size: var(--text-xs); }
    h3 { margin: 16px 0 4px; color: var(--ink-3); font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    ul { margin: 0; padding: 0; list-style: none; }
    li { display: flex; min-height: 36px; align-items: center; gap: 8px; font-size: var(--text-sm); }
    li + li { border-top: 1px solid var(--line); }
    .nm { min-width: 0; flex: 1; overflow: hidden; color: var(--ink); text-overflow: ellipsis; white-space: nowrap; }
    .d { color: var(--tint-rose-ink); font-size: var(--text-xs); }
  `,
})
export class AgingCard {
  readonly buckets = input.required<AgingBucket[]>();
  readonly clients = input<OverdueClient[]>([]);
  protected readonly colors = BUCKET_COLORS;

  protected readonly segments = computed<BarSegment[]>(() =>
    this.buckets().map((b) => ({ label: b.bucket, value: Number(b.amount) || 0, color: BUCKET_COLORS[b.bucket] })),
  );
}
