import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AuthBrand } from './auth-brand';

/**
 * Shared frame for every auth page. Phones: a 220px dark brand header with the form card overlapping it.
 * From 1024px: brand panel (55%) + form panel (45%). No fixed heights on the form side, so the page scrolls
 * with the on-screen keyboard open, and a focused field is scrolled into view on touch devices.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [AuthBrand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(focusin)': 'revealFocused($event)' },
  template: `
    <main class="auth">
      <app-auth-brand class="brand" />
      <section class="side">
        <div class="panel rise-in">
          <img class="logo" src="brand/arqus-logo.png" alt="ARQUS Sports Consultancy" width="128" height="75" />
          <ng-content />
        </div>
        <p class="foot">© ARQUS Sports Consultancy</p>
      </section>
    </main>
  `,
  styles: `
    .auth {
      min-height: 100dvh;
      background: var(--wash);
    }
    .side {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-4);
      margin-top: -40px;
      padding: 0 16px var(--space-6);
    }
    .panel {
      width: 100%;
      max-width: 420px;
      padding: var(--space-6) 20px;
      border: 1px solid var(--line);
      border-radius: 24px 24px 20px 20px;
      background: var(--surface);
      box-shadow: var(--highlight), var(--shadow-3);
    }
    .logo {
      display: block;
      width: 112px;
      height: auto;
      margin: 0 auto var(--space-5);
    }
    .foot {
      margin: 0;
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    @media (min-width: 1024px) {
      .auth {
        display: grid;
        grid-template-columns: 55fr 45fr;
      }
      .side {
        justify-content: center;
        margin: 0;
        padding: var(--space-10) var(--space-8);
      }
      .panel {
        padding: var(--space-8);
        border-radius: 20px;
      }
      .logo {
        width: 128px;
        margin-bottom: var(--space-6);
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
