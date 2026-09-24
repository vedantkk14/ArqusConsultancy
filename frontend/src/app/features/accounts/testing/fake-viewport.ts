import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';

/** Fake viewport: every `(min-width: Npx)` query matches when `width >= N` (the shell's own queries too). */
export function fakeViewport(width: number) {
  const matches = (query: string): boolean => {
    const m = /min-width:\s*(\d+)px/.exec(query);
    return m ? width >= Number(m[1]) : false;
  };
  return {
    provide: BreakpointObserver,
    useValue: {
      isMatched: matches,
      observe: (query: string) => of({ matches: matches(query), breakpoints: {} }),
    },
  };
}
