import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../models';
import { AuthService } from './auth.service';

/**
 * Route access by role: `data: { roles: [Role.Admin, ...] }`.
 * No `roles` in data means any logged-in user. Others are sent to their own home page.
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const roles = route.data['roles'] as Role[] | undefined;
  const role = auth.role();

  if (!roles?.length || (role && roles.includes(role))) {
    return true;
  }
  return inject(Router).createUrlTree([auth.homeRoute()]);
};
