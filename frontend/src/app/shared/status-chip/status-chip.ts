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

@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [class]="'tone-' + resolvedTone()">{{ text() }}</span>`,
  styles: `
    .chip {
      display: inline-block;
      padding: 2px var(--space-2);
      border-radius: var(--radius-pill);
      font: var(--mat-sys-label-medium);
      white-space: nowrap;
    }
    .tone-success { background: var(--status-success-bg); color: var(--status-success-fg); }
    .tone-warning { background: var(--status-warning-bg); color: var(--status-warning-fg); }
    .tone-danger { background: var(--status-danger-bg); color: var(--status-danger-fg); }
    .tone-info { background: var(--status-info-bg); color: var(--status-info-fg); }
    .tone-neutral { background: var(--mat-sys-surface-variant); color: var(--mat-sys-on-surface-variant); }
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
  protected readonly text = computed(() =>
    this.status()
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
  );
}
