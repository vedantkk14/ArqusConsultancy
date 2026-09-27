import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ROLE_LABELS, Role } from '../../core/models';

const ROLE_STYLE: Record<Role, { icon: string; tone: string }> = {
  [Role.Admin]: { icon: 'shield_person', tone: 'ink' },
  [Role.SalesManager]: { icon: 'supervisor_account', tone: 'cyan' },
  [Role.SalesExec]: { icon: 'support_agent', tone: 'teal' },
  [Role.ProjectManager]: { icon: 'assignment_ind', tone: 'amber' },
};

/** The signed-in role as a small pill: the word is always written, the tint only reinforces it. */
@Component({
  selector: 'app-role-badge',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'badge t-' + style().tone"><mat-icon aria-hidden="true">{{ style().icon }}</mat-icon>{{ label() }}</span>`,
  styles: `
    :host { display: inline-flex; }
    .badge {
      display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 9px 0 6px;
      border-radius: var(--radius-pill); font-size: var(--text-xs); font-weight: 600; white-space: nowrap;
    }
    mat-icon { width: 14px; height: 14px; font-size: 14px; }
    .t-ink { background: var(--ink); color: var(--on-ink); }
    .t-cyan { background: var(--tint-cyan); color: var(--tint-cyan-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
  `,
})
export class RoleBadge {
  readonly role = input.required<Role>();
  protected readonly style = computed(() => ROLE_STYLE[this.role()]);
  protected readonly label = computed(() => ROLE_LABELS[this.role()]);
}
