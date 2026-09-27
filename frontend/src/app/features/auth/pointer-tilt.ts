import { DestroyRef, Directive, ElementRef, NgZone, afterNextRender, inject } from '@angular/core';

/**
 * Writes the pointer position (-1..1 on each axis, relative to the viewport centre) into `--px` and `--py`
 * on the host, so CSS can tilt and parallax its children. Desktop only: nothing happens on touch screens
 * or when the user prefers reduced motion. One rAF per frame at most, outside Angular's zone.
 */
@Directive({ selector: '[appPointerTilt]' })
export class PointerTilt {
  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const media = (q: string) => window.matchMedia?.(q).matches ?? false;
      if (!media('(pointer: fine)') || media('(prefers-reduced-motion: reduce)')) {
        return;
      }
      let frame = 0;
      const onMove = (e: PointerEvent) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          host.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
          host.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
        });
      };
      zone.runOutsideAngular(() => window.addEventListener('pointermove', onMove, { passive: true }));
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', onMove);
      });
    });
  }
}
