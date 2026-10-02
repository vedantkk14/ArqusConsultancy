import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { InrPipe, formatInr } from '../../../shared/money/inr.pipe';
import { ProjectListItem } from '../data/project.models';
import { BudgetBar } from '../ui/bits';
import { PanelHead } from '../ui/panel-head';

/**
 * Admin only: the project's budget is the finalized deal total. Total budget / expenses so far /
 * remaining, a usage bar, and an Excel download of every expense. A PM's page never renders it.
 */
@Component({
  selector: 'app-budget-panel',
  imports: [BudgetBar, InrPipe, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'card panel rise-in',
    style: '--i: 1',
    role: 'region',
    'aria-labelledby': 'budget-title',
  },
  template: `
    <app-panel-head title="Budget" [subtitle]="leftText()" headingId="budget-title" />
    @if (hasTotal()) {
      <app-budget-bar
        [usagePct]="project().usage_pct ?? '0'"
        [state]="project().state ?? 'ok'"
        [wide]="true"
      />
    }
    <dl class="figs">
      <div>
        <dt>Total budget</dt>
        <dd class="num">
          @if (hasTotal()) {
            {{ project().total_budget | inr }}
          } @else {
            <span class="muted">Not finalized</span>
          }
        </dd>
      </div>
      <div>
        <dt>Expenses so far</dt>
        <dd class="num">{{ project().spent | inr }}</dd>
      </div>
      <div>
        <dt>{{ overBy() ? 'Over by' : 'Remaining' }}</dt>
        <dd class="num" [class.neg]="overBy()">
          @if (!hasTotal()) {
            <span class="muted">—</span>
          } @else if (overBy()) {
            {{ overBy() | inr }}
          } @else {
            {{ project().remaining | inr }}
          }
        </dd>
      </div>
    </dl>
  `,
  styles: `
    :host {
      display: block;
      padding: var(--space-5);
    }
    .figs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3);
      margin: var(--space-4) 0 0;
    }
    dt {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    dd {
      margin: 2px 0 0;
      color: var(--ink);
      font-size: var(--text-md);
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .neg {
      color: var(--negative);
    }
    .muted {
      color: var(--ink-3);
      font-size: var(--text-sm);
      font-weight: 500;
    }
    @media (max-width: 480px) {
      .figs {
        grid-template-columns: 1fr 1fr;
      }
      .figs > div:last-child {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class BudgetPanel {
  readonly project = input.required<ProjectListItem>();

  protected readonly hasTotal = computed(() => !!this.project().total_budget);

  /** "₹4.8L left · 20% used" in plain words; an overspent project says how far over it is. */
  protected readonly leftText = computed(() => {
    const p = this.project();
    if (!p.total_budget || !p.remaining) {
      return 'The deal total is set once the deal is finalized in accounts.';
    }
    const pct = `${Math.floor(Number(p.usage_pct) || 0)}% used`;
    return p.remaining.startsWith('-')
      ? `${formatInr(p.remaining.slice(1))} over · ${pct}`
      : `${formatInr(p.remaining)} left · ${pct}`;
  });
  protected readonly overBy = computed(() => {
    const remaining = this.project().remaining;
    return remaining && remaining.startsWith('-') ? remaining.slice(1) : null;
  });
}
