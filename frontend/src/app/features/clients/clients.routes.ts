import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem } from '../../core/config/route-helpers';

export const CLIENTS_ROUTES: Routes = [
  {
    path: '',
    title: 'My Clients',
    canActivate: [roleGuard],
    data: { roles: findNavItem('/clients')?.roles },
    loadComponent: () => import('./pages/clients-page').then((m) => m.ClientsPage),
  },
];
