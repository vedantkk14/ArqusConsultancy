import { Routes } from '@angular/router';
import { findNavItem } from '../../core/config/route-helpers';
import { roleGuard } from '../../core/auth/role.guard';

export const LEAVES_ROUTES: Routes = [
  {
    path: '',
    title: 'Leaves',
    canActivate: [roleGuard],
    data: { roles: findNavItem('/leaves')?.roles },
    loadComponent: () => import('./pages/leaves-page').then((m) => m.LeavesPage),
  },
  {
    path: 'employee/:id',
    title: 'Employee leave history',
    canActivate: [roleGuard],
    data: { roles: findNavItem('/leaves')?.roles },
    loadComponent: () =>
      import('./pages/employee-leaves-page').then((m) => m.EmployeeLeavesPage),
  },
];
