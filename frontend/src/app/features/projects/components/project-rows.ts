import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ProjectListItem } from '../data/project.models';
import { BudgetBar, PersonAvatar } from '../ui/bits';
import { dueLabel, formatDay } from '../ui/business-time';

/** Projects as a table (>= 768px) or stacked cards (phones). The name is the link; buttons stay clickable. */
@Component({
  selector: 'app-project-rows',
  imports: [BudgetBar, InrCompactPipe, NgTemplateOutlet, PersonAvatar, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-rows.html',
  styleUrl: './project-rows.scss',
})
export class ProjectRows {
  readonly rows = input.required<ProjectListItem[]>();
  readonly layout = input<'table' | 'cards'>('table');
  /** Admin: shows "Assign" next to a missing project manager. */
  readonly canAssign = input(false);
  readonly skeleton = input(false);
  readonly now = input<Date>(new Date());
  readonly assign = output<ProjectListItem>();

  protected readonly placeholders = Array.from({ length: 6 }, (_, i) => i);
  protected readonly day = formatDay;

  protected due(project: ProjectListItem): string {
    return project.status === 'RUNNING' ? dueLabel(project.expected_end_date, this.now()) : '';
  }
}
