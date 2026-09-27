import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LedgerState, STATE_LABELS, STATE_TINT } from '../data/account.models';

const AVATAR_TINTS = ['cyan', 'teal', 'amber', 'rose', 'slate'];

/** Deterministic tint for a name (same person, same colour everywhere). */
export function tintFor(name: string): string {
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

/** Bar width in percent for a "collected %" string such as "42.5". Geometry only: capped at 100. */
export function barWidth(pct: string): number {
  const value = Number(pct);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/** "42.5" -> "42%": the fraction is dropped so 99.9 never reads as 100. */
export function pctText(pct: string): string {
  return `${Math.floor(Number(pct) || 0)}%`;
}

/** Round initials avatar in a deterministic token tint. Decorative: the name is always beside it. */
@Component({
  selector: 'app-person-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.--s.px]': 'size()' },
  template: `<span [class]="'av t-' + tint()">{{ initials() }}</span>`,
  styles: `
    :host { display: inline-flex; flex: none; }
    .av {
      display: grid; width: var(--s, 36px); height: var(--s, 36px); place-items: center; border-radius: 50%;
      font-size: calc(var(--s, 36px) * 0.36); font-weight: 600; letter-spacing: 0.02em;
    }
    .t-slate { background: var(--tint-slate); color: var(--tint-slate-ink); }
    .t-cyan { background: var(--tint-cyan); color: var(--tint-cyan-ink); }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-rose { background: var(--tint-rose); color: var(--tint-rose-ink); }
  `,
})
export class PersonAvatar {
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

/** Ledger state as a pill: the words are always written, the tint only reinforces them. */
@Component({
  selector: 'app-ledger-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'chip t-' + tint()"><i aria-hidden="true"></i>{{ label() }}</span>`,
  styles: `
    .chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: var(--radius-pill); font-size: var(--text-xs); font-weight: 600; white-space: nowrap; }
    i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .t-cyan { background: var(--tint-cyan); color: var(--tint-cyan-ink); }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-rose { background: var(--tint-rose); color: var(--tint-rose-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
  `,
})
export class LedgerStateChip {
  readonly state = input.required<LedgerState>();
  protected readonly label = computed(() => STATE_LABELS[this.state()]);
  protected readonly tint = computed(() => STATE_TINT[this.state()]);
}

/** "12d overdue" / "Overdue" pill (rose). Words are always written. */
@Component({
  selector: 'app-overdue-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill">{{ days() === null ? 'Overdue' : days() + 'd overdue' }}</span>`,
  styles: `
    .pill { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: var(--radius-pill); background: var(--tint-rose); color: var(--tint-rose-ink); font-size: var(--text-xs); font-weight: 600; white-space: nowrap; }
  `,
})
export class OverduePill {
  readonly days = input<number | null>(null);
}

/** Collected bar: teal fill on a plate track, "42% collected" written beside it. */
@Component({
  selector: 'app-collect-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="bar" aria-hidden="true"><span class="fill" [style.width.%]="width()"></span></span>
    <span class="txt"><strong class="num">{{ text() }}</strong> collected</span>
  `,
  styles: `
    :host { display: flex; min-width: 0; flex-direction: column; gap: 6px; }
    .bar { display: block; height: 8px; overflow: hidden; border-radius: var(--radius-pill); background: var(--plate); }
    .fill { display: block; height: 100%; border-radius: inherit; background: var(--data-teal); transform-origin: left; animation: grow 600ms var(--ease-out) both; }
    .txt { color: var(--ink-3); font-size: var(--text-xs); white-space: nowrap; }
    .txt strong { color: var(--ink); font-weight: 600; }
    @keyframes grow { from { transform: scaleX(0); } }
    @media (prefers-reduced-motion: reduce) { .fill { animation: none; } }
  `,
})
export class CollectBar {
  readonly pct = input.required<string>();
  protected readonly width = computed(() => barWidth(this.pct()));
  protected readonly text = computed(() => pctText(this.pct()));
}
