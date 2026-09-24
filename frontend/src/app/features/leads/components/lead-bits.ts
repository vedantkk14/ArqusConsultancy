import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { followupState, formatBusinessFull } from '../utils/business-time';
import { LeadStatus, STATUS_LABELS } from '../data/lead.models';

/** Status tints: the word is always written, the tint only reinforces it. */
export const STATUS_TINT: Record<LeadStatus, string> = {
  NEW: 'slate',
  CONTACTED: 'cyan',
  INTERESTED: 'amber',
  WON: 'teal',
  LOST: 'rose',
};

const AVATAR_TINTS = ['cyan', 'teal', 'amber', 'rose', 'slate'];

/** Deterministic tint for a name (same person, same colour everywhere). */
export function tintFor(name: string): string {
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

@Component({
  selector: 'app-lead-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [class]="'chip t-' + tint()"><i aria-hidden="true"></i>{{ label() }}</span>`,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 24px;
      padding: 0 10px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 600;
      white-space: nowrap;
    }
    i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .t-slate { background: var(--tint-slate); color: var(--tint-slate-ink); }
    .t-cyan { background: var(--tint-cyan); color: var(--tint-cyan-ink); }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-rose { background: var(--tint-rose); color: var(--tint-rose-ink); }
  `,
})
export class LeadStatusChip {
  readonly status = input.required<LeadStatus>();
  protected readonly label = computed(() => STATUS_LABELS[this.status()] ?? this.status());
  protected readonly tint = computed(() => STATUS_TINT[this.status()] ?? 'slate');
}

/** Follow-up pill: overdue = rose ("3d overdue"), today = amber, later = quiet, none = muted text. */
@Component({
  selector: 'app-followup-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="'pill k-' + state().kind" [attr.title]="full()">{{ state().label }}</span>`,
  styles: `
    .pill {
      display: inline-flex;
      align-items: center;
      height: 24px;
      padding: 0 10px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 500;
      white-space: nowrap;
    }
    .k-overdue { background: var(--tint-rose); color: var(--tint-rose-ink); font-weight: 600; }
    .k-today { background: var(--tint-amber); color: var(--tint-amber-ink); font-weight: 600; }
    .k-upcoming { background: var(--subtle); color: var(--ink-2); }
    .k-none { padding: 0; color: var(--ink-3); }
  `,
})
export class FollowupPill {
  readonly at = input<string | null>(null);
  readonly now = input<Date>(new Date());
  protected readonly state = computed(() => followupState(this.at(), this.now()));
  protected readonly full = computed(() => formatBusinessFull(this.at()) || null);
}

/** Round initials avatar in a deterministic token tint. Decorative: the name is always beside it. */
@Component({
  selector: 'app-lead-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.--s.px]': 'size()' },
  template: `<span [class]="'av t-' + tint()">{{ initials() }}</span>`,
  styles: `
    :host { display: inline-flex; flex: none; }
    .av {
      display: grid;
      width: var(--s, 36px);
      height: var(--s, 36px);
      place-items: center;
      border-radius: 50%;
      font-size: calc(var(--s, 36px) * 0.36);
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .t-slate { background: var(--tint-slate); color: var(--tint-slate-ink); }
    .t-cyan { background: var(--tint-cyan); color: var(--tint-cyan-ink); }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-rose { background: var(--tint-rose); color: var(--tint-rose-ink); }
  `,
})
export class LeadAvatar {
  readonly name = input.required<string>();
  readonly size = input(36);
  protected readonly tint = computed(() => tintFor(this.name()));
  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.charAt(0) ?? '?';
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  });
}
