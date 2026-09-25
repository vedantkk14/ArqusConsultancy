import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { InrCompactPipe } from '../../../../shared/money/inr.pipe';
import { PanelHead } from '../../components/panel-head';
import { PeriodSwitcher } from '../../components/period-switcher';
import { Period } from '../../dashboard.models';
import { ExecKpis } from '../sales-exec-dashboard.models';

/** Bordered strip with dividers: Won, Won value, Conversion %, Lost (+ commission if the API sends it). */
@Component({
  selector: 'app-my-results-strip',
  imports: [InrCompactPipe, PanelHead, PeriodSwitcher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'my-results-title' },
  template: `
    <app-panel-head title="My results" headingId="my-results-title">
      <app-period-switcher [value]="period()" (changed)="periodChanged.emit($event)" />
    </app-panel-head>
    <div class="strip">
      <div class="fig">
        <span class="lbl">Won</span>
        <span class="val num">{{ kpis().won_count }}</span>
      </div>
      <div class="fig">
        <span class="lbl">Won value</span>
        <span class="val num">{{ kpis().won_value | inrCompact }}</span>
      </div>
      <div class="fig">
        <span class="lbl">Conversion</span>
        <span class="val num">{{ kpis().conversion_pct }}%</span>
      </div>
      <div class="fig">
        <span class="lbl">Lost</span>
        <span class="val num">{{ kpis().lost_count }}</span>
      </div>
      @if (kpis().estimated_commission) {
        <div class="fig">
          <span class="lbl">Est. commission</span>
          <span class="val num">{{ kpis().estimated_commission | inrCompact }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      padding: var(--space-5);
    }
    .strip {
      display: flex;
      flex-wrap: wrap;
      border: 1px solid var(--line);
      border-radius: var(--radius-control);
      overflow: hidden;
    }
    .fig {
      display: flex;
      flex: 1 1 100px;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      border-right: 1px solid var(--line);
    }
    .fig:last-child {
      border-right: 0;
    }
    .lbl {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .val {
      color: var(--ink);
      font-size: var(--text-lg, 1.25rem);
      font-weight: 700;
    }
  `,
})
export class MyResultsStrip {
  readonly kpis = input.required<ExecKpis>();
  readonly period = input.required<Period>();
  readonly periodChanged = output<Period>();
}
