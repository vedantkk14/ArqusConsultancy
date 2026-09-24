import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AuthBrand } from './auth-brand';

/**
 * Shared frame for every auth page. Phones: a 220px dark brand header with the form card overlapping it.
 * From 1024px: brand panel (55%) + form panel (45%). No fixed heights on the form side, so the page scrolls
 * with the on-screen keyboard open, and a focused field is scrolled into view on touch devices.
 * Project `[below]` content (e.g. dev demo logins) to place it under the card.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [AuthBrand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(focusin)': 'revealFocused($event)' },
  styleUrl: './auth-card.scss',
  template: `
    <main class="auth">
      <app-auth-brand class="brand" />
      <section class="side">
        <svg class="watermark" viewBox="0 0 520 300" fill="none" aria-hidden="true" focusable="false">
          <ellipse cx="260" cy="120" rx="240" ry="92" />
          <ellipse cx="260" cy="120" rx="150" ry="52" />
          <path d="M40 190 Q260 280 480 190 M70 232 Q260 310 450 232" />
        </svg>
        <div class="card-wrap rise-in">
          <div class="card-x">
            <div class="band">
              <svg class="arcs" viewBox="0 0 420 112" fill="none" aria-hidden="true" focusable="false">
                <ellipse cx="210" cy="118" rx="240" ry="70" />
                <ellipse cx="210" cy="118" rx="170" ry="46" />
              </svg>
              <img class="logo" src="brand/arqus-logo.png" alt="ARQUS Sports Consultancy" width="124" height="73" />
            </div>
            <div class="body">
              <ng-content />
            </div>
          </div>
        </div>
        <ng-content select="[below]" />
        <p class="foot">© ARQUS Sports Consultancy</p>
      </section>
    </main>
  `,
})
export class AuthLayout {
  /** On touch devices the keyboard can cover the field: bring it into view once the keyboard is up. */
  protected revealFocused(event: FocusEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.matches('input') || !window.matchMedia?.('(pointer: coarse)').matches) {
      return;
    }
    setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'auto' }), 300);
  }
}
