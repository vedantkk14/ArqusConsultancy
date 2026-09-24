import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { InrPipe, formatInr } from '../../../shared/money/inr.pipe';
import { ProjectListItem } from '../data/project.models';
import { BudgetBar } from '../ui/bits';
import { PanelHead } from '../ui/panel-head';

/** The budget every role may see: gauge, a plain-language line and Sanctioned / Spent / Remaining. */
@Component({
  selector: 'app-budget-panel',
  imports: [BudgetBar, InrPipe, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel rise-in', style: '--i: 1', role: 'region', 'aria-labelledby': 'budget-title' },
  template: `
    <app-panel-head title="Budget" [subtitle]="leftText()" headingId="budget-title" />
    <app-budget-bar [usagePct]="project().usage_pct" [state]="project().state" [wide]="true" />
    <dl class="figs">
      <div>
        <dt>Sanctioned</dt>
        <dd class="num">{{ project().sanctioned_budget | inr }}</dd>
      </div>
      <div>
        <dt>Spent</dt>
        <dd class="num">{{ project().spent | inr }}</dd>
      </div>
      <div>
        <dt>{{ overBy() ? 'Over by' : 'Remaining' }}</dt>
        <dd class="num" [class.neg]="overBy()">{{ overBy() ? (overBy() | inr) : (project().remaining | inr) }}</dd>
      </div>
    </dl>
  `,
  styles: `
    :host { display: block; padding: var(--space-5); }
    .figs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: var(--space-4) 0 0; }
    dt { color: var(--ink-3); font-size: var(--text-xs); }
    dd { margin: 2px 0 0; color: var(--ink); font-size: var(--text-md); font-weight: 600; overflow-wrap: anywhere; }
    .neg { color: var(--negative); }
  `,
})
export class BudgetPanel {
  readonly project = input.required<ProjectListItem>();

  /** "₹4.8L left · 20% used" in plain words; an overspent project says how far over it is. */
  protected readonly leftText = computed(() => {
    const p = this.project();
    const pct = `${Math.floor(Number(p.usage_pct) || 0)}% used`;
    return p.remaining.startsWith('-')
      ? `${formatInr(p.remaining.slice(1))} over · ${pct}`
      : `${formatInr(p.remaining)} left · ${pct}`;
  });
  protected readonly overBy = computed(() => {
    const remaining = this.project().remaining;
    return remaining.startsWith('-') ? remaining.slice(1) : null;
  });
}
