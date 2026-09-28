import { MatIconModule } from '@angular/material/icon';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ProjectListItem } from '../data/project.models';
import { BudgetBar, PersonAvatar } from '../ui/bits';
import { dueLabel, formatDay } from '../ui/business-time';

/**
 * Projects as a table (>= 768px) or stacked cards (phones). The name is the link; buttons stay clickable.
 * The budget columns (the deal total) are Admin only; a PM sees the expenses so far.
 */
@Component({
  selector: 'app-project-rows',
  imports: [
    MatIconModule,
    BudgetBar,
    InrCompactPipe,
    NgTemplateOutlet,
    PersonAvatar,
    RouterLink,
    Skeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-rows.html',
  styleUrl: './project-rows.scss',
})
export class ProjectRows {
  readonly rows = input.required<ProjectListItem[]>();
  readonly layout = input<'table' | 'cards'>('table');
  /** Admin: shows "Assign" next to a missing project manager. */
  readonly canAssign = input(false);
  /** Admin: total budget, remaining and a usage bar. */
  readonly showBudget = input(false);
  /** False for the Sales Manager, who never sees any money (not even expenses so far). */
  readonly showSpent = input(true);
  readonly skeleton = input(false);
  readonly now = input<Date>(new Date());
  /** Running page: a returning client's completed projects are listed under their current one. */
  readonly markCompleted = input(false);
  readonly assign = output<ProjectListItem>();

  protected readonly placeholders = Array.from({ length: 6 }, (_, i) => i);
  protected readonly day = formatDay;

  protected isPast(p: ProjectListItem): boolean {
    return this.markCompleted() && p.status === 'COMPLETED';
  }

  /** Same client as the row above: drawn as one group. */
  protected continues(i: number): boolean {
    const rows = this.rows();
    return i > 0 && !!rows[i].project_no && rows[i - 1].client_name === rows[i].client_name;
  }

  protected due(project: ProjectListItem): string {
    return project.status === 'RUNNING' ? dueLabel(project.expected_end_date, this.now()) : '';
  }
}
