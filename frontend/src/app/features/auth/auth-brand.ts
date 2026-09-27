import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PointerTilt } from './pointer-tilt';

/**
 * Dark brand panel of the auth pages: ink gradient, drifting cyan orbs, dot grid, stadium rings with
 * pointer parallax, the emblem on a floating white disc (the emblem is black, so it only sits on white),
 * the tagline and three glass chips. Decorative apart from the headline. Pure CSS/SVG.
 */
@Component({
  selector: 'app-auth-brand',
  imports: [MatIconModule, PointerTilt],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-brand.scss',
  template: `
    <div class="bg" aria-hidden="true">
      <span class="orb orb-a"></span>
      <span class="orb orb-b"></span>
      <span class="dots"></span>
    </div>

    <div class="stage" appPointerTilt aria-hidden="true">
      <svg class="rings" viewBox="0 0 520 300" fill="none">
        <ellipse class="ring r1" cx="260" cy="150" rx="250" ry="92" />
        <ellipse class="ring r2" cx="260" cy="150" rx="190" ry="70" />
        <ellipse class="ring r3" cx="260" cy="150" rx="130" ry="48" />
      </svg>
      <div class="disc">
        <img src="brand/arqus-emblem.png" alt="" width="104" height="52" />
      </div>
      <span class="chip c1"><mat-icon>contacts</mat-icon>Track every lead</span>
      <span class="chip c2"><mat-icon>savings</mat-icon>Control project budgets</span>
      <span class="chip c3"><mat-icon>payments</mat-icon>Collect payments faster</span>
    </div>

    <div class="copy">
      <p class="headline">Idealize. Innovate. Achieve.</p>
      <p class="sub">One place for your leads, projects and accounts.</p>
    </div>
  `,
})
export class AuthBrand {}
