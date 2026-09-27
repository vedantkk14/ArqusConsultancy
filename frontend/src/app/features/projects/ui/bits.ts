import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BudgetState, STATE_LABELS, STATE_TINT } from '../data/project.models';

const AVATAR_TINTS = ['cyan', 'teal', 'amber', 'rose', 'slate'];

/** Deterministic tint for a name (same person, same colour everywhere). */
export function tintFor(name: string): string {
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

/** Bar width in percent for a usage string such as "82.50". Geometry only: capped at 100. */
export function barWidth(usagePct: string): number {
  const value = Number(usagePct);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/** "82.50" -> "82%"; the fraction is dropped (never rounded up into the next state). */
export function pctText(usagePct: string): string {
  return `${Math.floor(Number(usagePct) || 0)}%`;
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

/** Budget state as a pill: the words are always written, the tint only reinforces them. */
@Component({
  selector: 'app-budget-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'chip t-' + tint()"><i aria-hidden="true"></i>{{ label() }}</span>`,
  styles: `
    .chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: var(--radius-pill); font-size: var(--text-xs); font-weight: 600; white-space: nowrap; }
    i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .t-cyan { background: var(--tint-cyan); color: var(--tint-cyan-ink); }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-rose { background: var(--tint-rose); color: var(--tint-rose-ink); }
  `,
})
export class BudgetStateChip {
  readonly state = input.required<BudgetState>();
  protected readonly label = computed(() => STATE_LABELS[this.state()]);
  protected readonly tint = computed(() => STATE_TINT[this.state()]);
}

/**
 * Usage bar: cyan under 80%, amber from 80 to 100, rose above 100, with "82% · Near limit" written beside it.
 * `wide` draws the thicker bar of the detail page, with a tick at the 80% warning line.
 */
@Component({
  selector: 'app-budget-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="bar" [class]="'bar s-' + state()" [class.wide]="wide()" aria-hidden="true">
      <span class="fill" [style.width.%]="width()"></span>
      @if (wide()) {
        <span class="tick"></span>
      }
    </span>
    <span class="txt"><strong class="num">{{ text() }}</strong> · {{ label() }}</span>
  `,
  styles: `
    :host { display: flex; min-width: 0; flex-direction: column; gap: 6px; }
    .bar { position: relative; display: block; height: 8px; overflow: hidden; border-radius: var(--radius-pill); background: var(--plate); }
    .bar.wide { height: 14px; overflow: visible; }
    .fill {
      display: block; height: 100%; border-radius: inherit; background: var(--data-cyan); transform-origin: left;
      animation: grow 600ms var(--ease-out) both;
    }
    .s-warn .fill { background: var(--data-amber); }
    .s-over .fill { background: var(--data-rose); }
    .tick { position: absolute; top: -3px; bottom: -3px; left: 80%; width: 2px; border-radius: 1px; background: var(--ink-3); opacity: 0.55; }
    .txt { color: var(--ink-3); font-size: var(--text-xs); white-space: nowrap; }
    .txt strong { color: var(--ink); font-weight: 600; }
    @keyframes grow { from { transform: scaleX(0); } }
    @media (prefers-reduced-motion: reduce) { .fill { animation: none; } }
  `,
})
export class BudgetBar {
  readonly usagePct = input.required<string>();
  readonly state = input.required<BudgetState>();
  readonly wide = input(false);
  protected readonly width = computed(() => barWidth(this.usagePct()));
  protected readonly text = computed(() => pctText(this.usagePct()));
  protected readonly label = computed(() => STATE_LABELS[this.state()]);
}
