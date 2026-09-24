import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { DESKTOP_QUERY, WIDE_QUERY } from '../layout.service';

/** Fake viewport: `width` decides which media queries match. */
export function fakeBreakpoints(width: number) {
  const matches = (q: string) =>
    (q === DESKTOP_QUERY && width >= 1024) || (q === WIDE_QUERY && width >= 1280);
  return {
    provide: BreakpointObserver,
    useValue: {
      isMatched: (q: string) => matches(q),
      observe: (q: string) => of({ matches: matches(q), breakpoints: {} }),
    },
  };
}
