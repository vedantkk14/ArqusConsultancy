import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarRow {
  label: string;
  /** Drives the bar length. */
  value: number;
  /** What is written at the end of the row (e.g. "18" or "₹32.4L · 7 won"). */
  display: string;
}

/** Slim ranked horizontal bars. The value is always written out; the bar only supports it. */
@Component({
  selector: 'app-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <ul>
        @for (row of rows(); track row.label) {
          <li>
            <div class="top">
              <span class="name">{{ row.label }}</span>
              <span class="val num">{{ row.display }}</span>
            </div>
            <div class="track" aria-hidden="true">
              <span [style.width.%]="width(row.value)"></span>
            </div>
          </li>
        }
      </ul>
    } @else {
      <p class="empty">No data for this period</p>
    }
  `,
  styles: `
    ul {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
      font-size: var(--text-base);
    }
    .name {
      color: var(--ink-2);
    }
    .val {
      color: var(--ink);
      font-weight: 500;
      white-space: nowrap;
    }
    .track {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--line);
    }
    .track span {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--brand), var(--brand-deep));
    }
    .empty {
      display: grid;
      place-items: center;
      min-height: 140px;
      margin: 0;
      color: var(--ink-3);
    }
  `,
})
export class BarList {
  readonly rows = input.required<BarRow[]>();

  private readonly max = computed(() => Math.max(...this.rows().map((r) => r.value), 0));

  protected width(value: number): number {
    return this.max() ? Math.max(2, (value / this.max()) * 100) : 0;
  }
}
