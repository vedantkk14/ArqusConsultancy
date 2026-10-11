import { inject } from '@angular/core';
import { ResolveFn, Routes } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem } from '../../core/config/route-helpers';
import { Role } from '../../core/models';

/** Title varies by role: Admin sees "All expenses", SM sees "My project expenses", PM sees "My expenses". */
const allTitle: ResolveFn<string> = () => {
  const role = inject(AuthService).role();
  if (role === Role.ProjectManager) return 'My expenses';
  if (role === Role.SalesManager) return 'My project expenses';
  return 'All expenses';
};

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
];
