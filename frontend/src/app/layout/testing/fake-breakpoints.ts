import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';

/** Fake viewport: `width` decides which `(min-width: Npx)` media queries match. */
export function fakeBreakpoints(width: number) {
  const matches = (q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q);
    return min ? width >= Number(min[1]) : false;
  };
  return {
    provide: BreakpointObserver,
    useValue: {
      isMatched: (q: string) => matches(q),
      observe: (q: string) => of({ matches: matches(q), breakpoints: {} }),
    },
  };
}
