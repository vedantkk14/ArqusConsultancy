import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RecentActivity } from '../dashboard.models';
import { relativeTime } from '../dashboard-utils';
import { PanelHead } from './panel-head';

const TYPE_ICON: Record<string, { icon: string; tint: string }> = {
  lead: { icon: 'contacts', tint: 'cyan' },
  payment: { icon: 'payments', tint: 'teal' },
  expense: { icon: 'receipt', tint: 'amber' },
  project: { icon: 'assignment', tint: 'slate' },
  user: { icon: 'person', tint: 'slate' },
};

/** Timeline of the last 8 actions. */
@Component({
  selector: 'app-activity-card',
  imports: [MatIconModule, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'activity-title' },
  template: `
    <app-panel-head title="Activity" subtitle="Latest across the team" link="/settings/audit-log" headingId="activity-title" />
    <ol>
      @for (a of items(); track $index) {
        <li>
          <span [class]="'dot t-' + a.tint" aria-hidden="true"><mat-icon>{{ a.icon }}</mat-icon></span>
          <span class="txt"><b>{{ a.actor }}</b> {{ a.action }}<time [attr.datetime]="a.when">{{ a.ago }}</time></span>
        </li>
      } @empty {
        <li class="none">No activity yet</li>
      }
    </ol>
  `,
  styles: `
    ol { margin: 0; padding: 0; list-style: none; }
    li { position: relative; display: flex; gap: 12px; padding-bottom: 14px; color: var(--ink-2); font-size: var(--text-sm); }
    li:not(:last-child)::before { position: absolute; top: 30px; bottom: 2px; left: 13px; width: 1px; background: var(--line); content: ''; }
    .dot { display: grid; width: 28px; height: 28px; flex: none; place-items: center; border-radius: 50%; }
    .dot mat-icon { width: 16px; height: 16px; font-size: 16px; }
    .t-cyan { background: var(--tint-cyan); color: var(--tint-cyan-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-slate { background: var(--tint-slate); color: var(--tint-slate-ink); }
    .txt { min-width: 0; line-height: 1.4; }
    b { color: var(--ink); font-weight: 600; }
    time { display: block; color: var(--ink-3); font-size: var(--text-xs); }
    .none { color: var(--ink-3); }
  `,
})
export class ActivityCard {
  readonly rows = input.required<RecentActivity[]>();
  readonly now = input<Date>(new Date());

  protected readonly items = computed(() =>
    this.rows()
      .slice(0, 8)
      .map((a) => ({ ...a, ...(TYPE_ICON[a.type ?? ''] ?? TYPE_ICON['user']), ago: relativeTime(a.when, this.now()) })),
  );
}
