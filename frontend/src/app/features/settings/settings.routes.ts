import { Route, Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem, placeholderRoutes } from '../../core/config/route-helpers';

function page(path: string, title: string, load: () => Promise<unknown>): Route {
  return {
    path,
    title,
    canActivate: [roleGuard],
    data: { roles: findNavItem(`/settings/${path}`)?.roles },
    loadComponent: load as Route['loadComponent'],
  };
}

export const SETTINGS_ROUTES: Routes = [
  page('audit-log', 'Audit log', () => import('./audit-log/audit-log-page').then((m) => m.AuditLogPage)),
  page('profile', 'Profile', () => import('./profile/profile-page').then((m) => m.ProfilePage)),
  ...placeholderRoutes('/settings').filter((r) => r.path === ''),
];
