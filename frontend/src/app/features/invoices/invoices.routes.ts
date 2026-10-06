import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem } from '../../core/config/route-helpers';

const guard = () => ({
  canActivate: [roleGuard],
  data: { roles: findNavItem('/invoices')?.roles },
});

export const INVOICES_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'all' },
  {
    path: 'all',
    title: 'All invoices',
    ...guard(),
    loadComponent: () => import('./pages/invoices-list-page').then((m) => m.InvoicesListPage),
  },
  {
    path: 'new',
    title: 'Generate invoice',
    ...guard(),
    loadComponent: () => import('./pages/invoice-form-page').then((m) => m.InvoiceFormPage),
  },
  {
    path: ':id/edit',
    title: 'Edit invoice',
    ...guard(),
    loadComponent: () => import('./pages/invoice-form-page').then((m) => m.InvoiceFormPage),
  },
  {
    path: ':id',
    title: 'Invoice',
    ...guard(),
    loadComponent: () => import('./pages/invoice-detail-page').then((m) => m.InvoiceDetailPage),
  },
];
