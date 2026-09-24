import { Route, Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem, placeholderRoutes } from '../../core/config/route-helpers';

function page(path: string, title: string, load: () => Promise<unknown>): Route {
  return {
    path,
    title,
    canActivate: [roleGuard],
    data: { roles: findNavItem(`/team/${path}`)?.roles },
    loadComponent: load as Route['loadComponent'],
  };
}

// The group's own "/team" redirect (first page the role may open) comes from the placeholder helper.
export const TEAM_ROUTES: Routes = [
  page('users', 'Users', () => import('./users/users-page').then((m) => m.UsersPage)),
  page('commission-rates', 'Commission rates', () => import('./commission/commission-page').then((m) => m.CommissionPage)),
  page('assignments', 'Assignments', () => import('./assignments/assignments-page').then((m) => m.AssignmentsPage)),
  ...placeholderRoutes('/team').filter((r) => r.path === ''),
];
