import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Two-segment bar (first = cyan, second = ink). Decorative: the figures are always written beside it. */
@Component({
  selector: 'app-split-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" aria-hidden="true">
      @if (total() > 0) {
        <span class="a" [style.width.%]="share()"></span>
        <span class="b" [style.width.%]="100 - share()"></span>
      }
    </div>
  `,
  styles: `
    .track {
      display: flex;
      gap: 2px;
      height: 10px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--plate);
    }
    span {
      display: block;
      height: 100%;
      transition: width var(--dur-base) var(--ease-out);
    }
    .a {
      background: var(--split-a, var(--grad-brand));
      border-radius: 999px 0 0 999px;
    }
    .b {
      background: linear-gradient(90deg, var(--ink-2), var(--ink));
      border-radius: 0 999px 999px 0;
    }
  `,
})
export class SplitBar {
  readonly first = input.required<number>();
  readonly second = input.required<number>();

  protected readonly total = computed(() => this.first() + this.second());
  protected readonly share = computed(() => (this.total() ? (this.first() / this.total()) * 100 : 0));
}
