import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Default colours for known statuses; anything else is neutral. Extend as modules land. */
const STATUS_TONES: Record<string, StatusTone> = {
  WON: 'success',
  COMPLETED: 'success',
  PAID: 'success',
  RUNNING: 'info',
  NEW: 'info',
  IN_PROGRESS: 'info',
  PENDING: 'warning',
  OVERDUE: 'danger',
  LOST: 'danger',
  CANCELLED: 'danger',
};

/** Pill with a dot and the status as text, so colour is never the only signal. */
@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [class]="'tone-' + resolvedTone()"><i aria-hidden="true"></i>{{ text() }}</span>`,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 22px;
      padding: 0 8px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 500;
      white-space: nowrap;
    }
    i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .tone-success { background: var(--positive-bg); color: var(--positive); }
    .tone-warning { background: var(--warning-bg); color: var(--warning); }
    .tone-danger { background: var(--negative-bg); color: var(--negative); }
    .tone-info { background: var(--brand-tint); color: var(--brand-deep); }
    .tone-neutral { background: var(--subtle); color: var(--ink-2); }
  `,
})
export class StatusChip {
  /** Raw status value, e.g. "IN_PROGRESS". */
  readonly status = input.required<string>();
  /** Force a colour instead of using the default mapping. */
  readonly tone = input<StatusTone | null>(null);

  protected readonly resolvedTone = computed(
    () => this.tone() ?? STATUS_TONES[this.status().toUpperCase()] ?? 'neutral',
  );
  protected readonly text = computed(() => {
    const words = this.status().toLowerCase().split('_').join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  });
}
