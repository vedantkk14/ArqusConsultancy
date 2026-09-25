import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STATUS_LABELS } from '../../../leads/data/lead.models';
import { BarSegment, StackedBar } from '../../components/stacked-bar';
import { PanelHead } from '../../components/panel-head';
import { PipelineStage } from '../sales-exec-dashboard.models';

const STAGE_COLORS: Record<string, string> = {
  NEW: 'data-slate',
  CONTACTED: 'data-cyan',
  INTERESTED: 'data-teal',
  WON: 'data-ink',
  LOST: 'data-slate',
};

/** One bar per status, this Exec's own leads. Won/Lost are shown too - the whole funnel. */
@Component({
  selector: 'app-my-pipeline-card',
  imports: [PanelHead, StackedBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'my-pipeline-title' },
  template: `
    <app-panel-head title="My pipeline" headingId="my-pipeline-title" />
    <app-stacked-bar [segments]="segments()" />
    <ul class="legend">
      @for (s of stagesView(); track s.status) {
        <li><i [style.background]="'var(--' + s.color + ')'" aria-hidden="true"></i>{{ s.label }} <b class="num">{{ s.count }}</b></li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-5);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--ink-2);
      font-size: var(--text-sm);
    }
    .legend li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
  `,
})
export class MyPipelineCard {
  readonly stages = input.required<PipelineStage[]>();

  protected readonly stagesView = computed(() =>
    this.stages().map((s) => ({
      ...s,
      label: STATUS_LABELS[s.status] ?? s.status,
      color: STAGE_COLORS[s.status] ?? 'data-slate',
    })),
  );
  protected readonly segments = computed<BarSegment[]>(() =>
    this.stagesView().map((s) => ({ label: s.label, value: s.count, color: s.color })),
  );
}
