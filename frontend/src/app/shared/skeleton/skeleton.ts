import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A shimmering placeholder block. Shape it like the content it stands in for. */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    class: 'skeleton',
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.border-radius]': 'radius()',
  },
})
export class Skeleton {
  readonly width = input('100%');
  readonly height = input('14px');
  readonly radius = input('6px');
}
