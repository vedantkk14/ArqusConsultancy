import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Decorative concentric ellipses in logo cyan, echoing the stadium emblem.
 * Meant for dark (--ink) surfaces. Purely visual: hidden from assistive tech.
 */
@Component({
  selector: 'app-brand-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 480 220" fill="none" aria-hidden="true" focusable="false">
      <g stroke="#32C5F3" stroke-width="2">
        <ellipse cx="240" cy="110" rx="232" ry="98" opacity="0.14" />
        <ellipse cx="240" cy="110" rx="188" ry="80" opacity="0.26" />
        <ellipse cx="240" cy="110" rx="144" ry="62" opacity="0.42" />
        <ellipse cx="240" cy="110" rx="100" ry="44" opacity="0.62" />
      </g>
      <ellipse cx="240" cy="110" rx="58" ry="26" fill="#32C5F3" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
  `,
})
export class BrandArt {}
