import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { BudgetBar } from '../../projects/ui/bits';
import { PmProject } from './pm-dashboard.models';

/** One of the PM's projects: name, status, the same usage bar as the detail page, and the budget triple as text. */
@Component({
  selector: 'app-pm-project-card',
  imports: [BudgetBar, InrPipe, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = project();
    <div class="card card-link pc">
      <a class="lnk" [routerLink]="['/projects', p.id]" [attr.aria-label]="'Open ' + p.name">
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
      @if (project().status === 'RUNNING') {
        <button
          type="button"
          class="add"
          [attr.aria-label]="'Add expense to ' + project().name"
          (click)="addExpense.emit(project())"
        >
          <mat-icon aria-hidden="true">add</mat-icon>Add expense
        </button>
        @if (project().state !== 'ok') {
          <a class="add ask" [routerLink]="['/projects', project().id]" [queryParams]="{ request_budget: 1 }">
            <mat-icon aria-hidden="true">request_quote</mat-icon>Request more budget
          </a>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .lnk {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      color: inherit;
      text-decoration: none;
    }
    .lnk:focus-visible {
      outline: 2px solid var(--brand-deep);
      outline-offset: 4px;
      border-radius: var(--radius-card);
      box-shadow: var(--ring);
    }
    .add {
      display: inline-flex;
      align-self: flex-start;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding: 0 16px 0 10px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-control);
      background: var(--surface);
      color: var(--ink);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 600;
      cursor: pointer;
    }
    .ask { margin-top: 8px; border-color: color-mix(in srgb, var(--tint-amber-ink) 35%, transparent); background: var(--tint-amber); color: var(--tint-amber-ink); text-decoration: none; }
    .add:hover {
      background: var(--subtle);
    }
    .add:focus-visible {
      outline: 2px solid var(--brand-deep);
      outline-offset: 2px;
      box-shadow: var(--ring);
    }
    .add mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
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
  readonly addExpense = output<PmProject>();
}
