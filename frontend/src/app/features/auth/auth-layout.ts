import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Shared frame for every auth page: paper background, white card with the full logo, quiet tagline.
 * No fixed heights: the page scrolls, so the primary button stays reachable above the on-screen keyboard,
 * and a focused field is scrolled into view on touch devices.
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(focusin)': 'revealFocused($event)' },
  template: `
    <main class="auth">
      <div class="card panel">
        <img class="logo" src="brand/arqus-logo.png" alt="ARQUS Sports Consultancy" width="128" height="75" />
        <ng-content />
      </div>
      <p class="tagline">Idealize. Innovate. Achieve.</p>
    </main>
  `,
  styles: `
    .auth {
      display: flex;
      min-height: 100dvh;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-5);
      padding: var(--space-8) 20px var(--space-6);
      background: var(--paper);
    }
    .panel {
      width: 100%;
      max-width: 400px;
      padding: var(--space-8) var(--space-6) var(--space-6);
      box-shadow: var(--shadow-card-hover);
    }
    .logo {
      display: block;
      width: 128px;
      height: auto;
      margin: 0 auto var(--space-6);
    }
    .tagline {
      margin: 0;
      color: var(--ink-3);
      font-size: var(--text-xs);
      letter-spacing: 0.02em;
    }
    @media (max-width: 599.98px) {
      .auth {
        justify-content: flex-start;
        padding-top: var(--space-6);
      }
      .panel {
        padding: var(--space-6) 20px;
        box-shadow: none;
      }
    }
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
