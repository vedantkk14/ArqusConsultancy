import { inject } from '@angular/core';
import { ResolveFn, Routes } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem } from '../../core/config/route-helpers';
import { Role } from '../../core/models';

/** A PM only ever sees expenses on their own projects, so their list is "My expenses". */
const allTitle: ResolveFn<string> = () => (inject(AuthService).role() === Role.ProjectManager ? 'My expenses' : 'All expenses');

// /expenses redirects to the list and keeps the query string.
export const EXPENSES_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'all' },
  {
    path: 'all',
    title: allTitle,
    canActivate: [roleGuard],
    data: { roles: findNavItem('/expenses/all')?.roles },
    loadComponent: () => import('./pages/expenses-list-page').then((m) => m.ExpensesListPage),
  },
  {
    path: 'alerts',
    title: 'Budget alerts',
    canActivate: [roleGuard],
    data: { roles: findNavItem('/expenses/alerts')?.roles },
    loadComponent: () => import('./pages/alerts-page').then((m) => m.AlertsPage),
  },
];
