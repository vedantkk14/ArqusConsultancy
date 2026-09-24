import { inject } from '@angular/core';
import { ResolveFn, Route, Router, Routes } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem, placeholderRoutes } from '../../core/config/route-helpers';
import { Role } from '../../core/models';
import { LeadDetail, ListMode } from './data/lead.models';
import { LeadsApi } from './data/leads-api.service';
import { unsavedChangesGuard } from './pages/lead-new-page';

/** Execs only ever see their own leads, so their list is "My leads". */
const allLeadsTitle: ResolveFn<string> = () => (inject(AuthService).role() === Role.SalesExec ? 'My leads' : 'All leads');

const leadResolver: ResolveFn<LeadDetail | null> = (route) =>
  inject(LeadsApi).getShared(Number(route.paramMap.get('id')));

/** The top bar's h1 is the lead's name. */
const leadTitle: ResolveFn<string> = (route) =>
  inject(LeadsApi)
    .getShared(Number(route.paramMap.get('id')))
    .pipe(map((lead) => lead?.name ?? 'Lead not found'));

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
  listRoute('won', 'won', 'Won leads'),
  listRoute('lost', 'lost', 'Lost leads'),
  // Old link (dashboard "Won deals to finalise"): now the Won page filtered to awaiting finalization.
  {
    path: 'won-awaiting',
    pathMatch: 'full',
    redirectTo: () => inject(Router).parseUrl('/leads/won?won_awaiting=true'),
  },
  {
    path: 'new',
    title: 'Add lead',
    canActivate: [roleGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { roles: findNavItem('/leads/new')?.roles },
    loadComponent: () => import('./pages/lead-new-page').then((m) => m.LeadNewPage),
  },
  ...placeholderRoutes('/leads').filter((r) => r.path !== ''),
  {
    path: ':id',
    title: leadTitle,
    canActivate: [roleGuard],
    resolve: { lead: leadResolver },
    runGuardsAndResolvers: 'always',
    data: { roles: findNavItem('/leads')?.roles },
    loadComponent: () => import('./pages/lead-detail-page').then((m) => m.LeadDetailPage),
  },
];
