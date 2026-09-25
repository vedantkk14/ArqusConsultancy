import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { BudgetBar } from '../../projects/ui/bits';
import { PmProject } from './pm-dashboard.models';

/** One of the PM's projects: name, status, the same usage bar as the detail page, and the budget triple as text. */
@Component({
  selector: 'app-pm-project-card',
  imports: [BudgetBar, InrPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = project();
    <a
      class="card card-link pc"
      [routerLink]="['/projects', p.id]"
      [attr.aria-label]="'Open ' + p.name"
    >
      <span class="top">
        <span class="t">
          <strong class="nm">{{ p.name }}</strong>
          <span class="cl">{{ p.client_name }}</span>
        </span>
        <span [class]="'status ' + (p.status === 'RUNNING' ? 'run' : 'done')"
          ><i aria-hidden="true"></i>{{ p.status === 'RUNNING' ? 'Running' : 'Completed' }}</span
        >
      </span>
      <app-budget-bar [usagePct]="p.usage_pct" [state]="p.state" [wide]="true" />
      <dl class="triple">
        <div>
          <dt>Sanctioned</dt>
          <dd class="num">{{ p.sanctioned_budget | inr }}</dd>
        </div>
        <div>
          <dt>Spent</dt>
          <dd class="num">{{ p.spent | inr }}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd class="num" [class.neg]="p.state === 'over'">{{ p.remaining | inr }}</dd>
        </div>
      </dl>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }
    .pc {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
    }
    .pc:focus-visible {
      outline: 2px solid var(--brand-deep);
      outline-offset: 2px;
      box-shadow: var(--ring);
    }
    .top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .t {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
    }
    .nm {
      color: var(--ink);
      font-size: var(--text-md);
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .cl {
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .status {
      display: inline-flex;
      flex: none;
      align-items: center;
      gap: 6px;
      height: 24px;
      padding: 0 10px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 600;
    }
    .status i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .run {
      background: var(--tint-cyan);
      color: var(--tint-cyan-ink);
    }
    .done {
      background: var(--tint-teal);
      color: var(--tint-teal-ink);
    }
    .triple {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-2);
      margin: 0;
    }
    .triple dt {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .triple dd {
      margin: 2px 0 0;
      color: var(--ink);
      font-size: var(--text-sm);
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .triple dd.neg {
      color: var(--tint-rose-ink);
    }
  `,
})
export class PmProjectCard {
  readonly project = input.required<PmProject>();
}
