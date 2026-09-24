import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InrCompactPipe } from '../../../../shared/money/inr.pipe';
import { LeadAvatar } from '../../../leads/components/lead-bits';
import { PanelHead } from '../../components/panel-head';
import { ExecRow, OVERDUE_HIGHLIGHT_THRESHOLD } from '../sales-manager-dashboard.models';

/**
 * Ranked by workload (open leads + overdue*2), highest first. An exec past the overdue
 * threshold is highlighted - a signal to look, never a verdict ("overdue > 3", nothing harsher).
 */
@Component({
  selector: 'app-by-executive-list',
  imports: [InrCompactPipe, LeadAvatar, PanelHead, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'by-exec-title' },
  template: `
    <app-panel-head title="By executive" subtitle="Ranked by workload" headingId="by-exec-title" />
    <div class="head" aria-hidden="true">
      <span></span><span>Open</span><span>Overdue</span><span>Won</span><span>Won value</span><span>Conv.</span>
    </div>
    <div class="rows">
      @for (row of ranked(); track row.id) {
        <a class="row" [class.hot]="row.overdue > threshold" [routerLink]="['/leads/all']" [queryParams]="{ assigned_to: row.id }">
          <span class="who" [attr.data-label]="''">
            <app-lead-avatar [name]="row.name" [size]="28" />
            <span class="nm">{{ row.name }}</span>
          </span>
          <span data-label="Open" class="num">{{ row.open_leads }}</span>
          <span data-label="Overdue" class="num" [class.pill]="row.overdue > 0">{{ row.overdue }}</span>
          <span data-label="Won" class="num">{{ row.won_count }}</span>
          <span data-label="Won value" class="num">{{ row.won_value | inrCompact }}</span>
          <span data-label="Conversion" class="num">{{ row.conversion_pct }}%</span>
        </a>
      } @empty {
        <p class="none">No sales executives yet. Add one from Team management.</p>
      }
    </div>
  `,
  styleUrl: './by-executive-list.scss',
})
export class ByExecutiveList {
  readonly rows = input.required<ExecRow[]>();
  protected readonly threshold = OVERDUE_HIGHLIGHT_THRESHOLD;
  protected readonly ranked = computed(() => [...this.rows()].sort((a, b) => b.load_score - a.load_score));
}
