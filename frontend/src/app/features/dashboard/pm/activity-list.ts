import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { formatBusinessFull, relativeLabel } from '../../projects/ui/business-time';
import { PmActivity, PmActivityType } from './pm-dashboard.models';

const ICONS: Record<PmActivityType, string> = {
  project_assigned: 'assignment_ind',
  budget_changed: 'tune',
  expense_added: 'receipt_long',
  project_completed: 'check_circle',
  project_reopened: 'replay',
};

/** The last few events on the PM's projects, newest first. */
@Component({
  selector: 'app-pm-activity-list',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul>
      @for (a of items(); track $index) {
        <li>
          <mat-icon aria-hidden="true">{{ icon(a.type) }}</mat-icon>
          <span class="t"
            ><span class="tx">{{ a.text }}</span
            ><span class="pj">{{ a.project_name }}</span></span
          >
          <time [attr.datetime]="a.at" [title]="full(a.at)">{{ rel(a.at) }}</time>
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: 32px 1fr auto;
      align-items: center;
      gap: 10px;
      min-height: 52px;
      padding: 6px 0;
      border-bottom: 1px solid var(--line);
    }
    li:last-child {
      border-bottom: 0;
    }
    mat-icon {
      display: grid;
      width: 32px;
      height: 32px;
      place-items: center;
      border-radius: 50%;
      background: var(--subtle);
      color: var(--ink-2);
      font-size: 18px;
    }
    .t {
      display: flex;
      min-width: 0;
      flex-direction: column;
    }
    .tx {
      color: var(--ink);
      font-size: var(--text-sm);
    }
    .pj {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    time {
      color: var(--ink-3);
      font-size: var(--text-xs);
      white-space: nowrap;
    }
  `,
})
export class PmActivityList {
  readonly items = input.required<PmActivity[]>();
  protected readonly icon = (type: PmActivityType) => ICONS[type] ?? 'history';
  protected readonly rel = relativeLabel;
  protected readonly full = formatBusinessFull;
}
