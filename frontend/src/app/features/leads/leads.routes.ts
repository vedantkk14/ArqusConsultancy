import { inject } from '@angular/core';
import { ResolveFn, Route, Routes } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem, placeholderRoutes } from '../../core/config/route-helpers';
import { Role } from '../../core/models';
import { ListMode } from './data/lead.models';

/** Execs only ever see their own leads, so their list is "My leads". */
const allLeadsTitle: ResolveFn<string> = () => (inject(AuthService).role() === Role.SalesExec ? 'My leads' : 'All leads');

function listRoute(path: string, mode: ListMode, title: string | ResolveFn<string>): Route {
  return {
    path,
    title,
    canActivate: [roleGuard],
    data: { roles: findNavItem(`/leads/${path}`)?.roles, mode },
    loadComponent: () => import('./pages/leads-list-page').then((m) => m.LeadsListPage),
  };
}

// Real pages come before the placeholders with the same path. The list lives at /leads/all
// (the dashboards' "View all" links); /leads redirects there and keeps the query string.
export const LEADS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'all' },
  listRoute('all', 'all', allLeadsTitle),
  listRoute('overdue', 'overdue', 'Overdue follow-ups'),
  listRoute('won-awaiting', 'won-awaiting', 'Won - awaiting finalization'),
  ...placeholderRoutes('/leads').filter((r) => r.path !== ''),
];
