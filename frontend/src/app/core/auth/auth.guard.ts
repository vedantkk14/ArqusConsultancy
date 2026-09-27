import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, CHANGE_PASSWORD_URL } from './auth.service';

/** Requires a signed-in user; otherwise /login, remembering where they were going. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).isAuthenticated()) {
    return true;
  }
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** For /login and the password pages: a signed-in user goes to their home (or the forced change). */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).parseUrl(auth.afterLoginUrl()) : true;
};

/**
 * While the account must change its password, every page except the change-password page redirects
 * there (use as canActivate and canActivateChild on the app shell).
 */
export const mustChangePasswordGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (!auth.mustChangePassword() || state.url.split('?')[0] === CHANGE_PASSWORD_URL) {
    return true;
  }
  return inject(Router).createUrlTree([CHANGE_PASSWORD_URL], { queryParams: { forced: 'true' } });
};
