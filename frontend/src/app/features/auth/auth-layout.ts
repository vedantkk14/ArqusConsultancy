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
        <div class="card-wrap rise-in">
          <div class="card-x">
            <img class="logo" src="brand/arqus-logo.png" alt="ARQUS Sports Consultancy" width="132" height="78" />
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
