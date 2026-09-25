import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { BudgetStateChip, pctText } from '../../projects/ui/bits';
import { PmAlert } from './pm-dashboard.models';

/** A project near or over its sanctioned budget. The state is written out, never colour alone. */
@Component({
  selector: 'app-pm-alert-row',
  imports: [BudgetStateChip, InrPipe, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = alert();
    <a class="row" [routerLink]="['/projects', a.project_id]">
      <span class="nm">{{ a.project_name }}</span>
      <app-budget-state [state]="a.state" />
      <span class="pct num">{{ pct(a.usage_pct) }} used</span>
      <span class="rem num">{{ a.remaining | inr }} left</span>
      <mat-icon aria-hidden="true">chevron_right</mat-icon>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 4px 12px;
      min-height: 56px;
      padding: 10px var(--space-3);
      border-radius: var(--radius-control);
      color: inherit;
      text-decoration: none;
      transition: background-color var(--dur-fast);
    }
    .row:hover {
      background: var(--surface-2);
    }
    .row:focus-visible {
      outline: 2px solid var(--brand-deep);
      outline-offset: -2px;
      box-shadow: var(--ring);
    }
    .nm {
      grid-column: 1;
      color: var(--ink);
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    app-budget-state {
      grid-column: 2;
      grid-row: 1;
      justify-self: end;
    }
    .pct,
    .rem {
      grid-column: 1;
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    mat-icon {
      display: none;
    }
    @media (min-width: 768px) {
      .row {
        grid-template-columns: minmax(0, 1fr) auto 90px 150px 20px;
      }
      .nm,
      .pct,
      .rem,
      app-budget-state {
        grid-column: auto;
        grid-row: auto;
      }
      .rem {
        text-align: right;
      }
      mat-icon {
        display: block;
        width: 20px;
        height: 20px;
        font-size: 20px;
        color: var(--ink-3);
      }
    }
  `,
})
export class PmAlertRow {
  readonly alert = input.required<PmAlert>();
  protected readonly pct = pctText;
}
