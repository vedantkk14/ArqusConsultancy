import { inject } from '@angular/core';
import { ResolveFn, Route, Routes } from '@angular/router';
import { map } from 'rxjs';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem } from '../../core/config/route-helpers';
import { LedgerDetail, LedgerMode } from './data/account.models';
import { AccountsApi } from './data/accounts-api.service';

const ledgerResolver: ResolveFn<LedgerDetail | null> = (route) => inject(AccountsApi).ledgerShared(Number(route.paramMap.get('id')));

/** The top bar's h1 is the client's name. */
const ledgerTitle: ResolveFn<string> = (route) =>
  inject(AccountsApi)
    .ledgerShared(Number(route.paramMap.get('id')))
    .pipe(map((ledger) => ledger?.client ?? 'Ledger not found'));

function listRoute(path: string, mode: LedgerMode, title: string): Route {
  return {
    path,
    title,
    canActivate: [roleGuard],
    data: { roles: findNavItem(`/accounts/${path === 'ledgers' ? 'ledgers' : path}`)?.roles, mode },
    loadComponent: () => import('./pages/ledgers-list-page').then((m) => m.LedgersListPage),
  };
}

const adminOnly = () => findNavItem('/accounts')?.roles;

// All Accounts pages are admin only (the group's roles). /accounts redirects to the ledgers.
export const ACCOUNTS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'ledgers' },
  listRoute('ledgers', 'all', 'Customer ledgers'),
  listRoute('pending', 'pending', 'Pending collections'),
  {
    path: 'ledgers/:id',
    title: ledgerTitle,
    canActivate: [roleGuard],
    resolve: { ledger: ledgerResolver },
    runGuardsAndResolvers: 'always',
    data: { roles: adminOnly() },
    loadComponent: () => import('./pages/ledger-detail-page').then((m) => m.LedgerDetailPage),
  },
  {
    path: 'payments',
    title: 'Payment entries',
    canActivate: [roleGuard],
    data: { roles: adminOnly() },
    loadComponent: () => import('./pages/payments-page').then((m) => m.PaymentsPage),
  },
  {
    path: 'payments/:id/receipt',
    title: 'Payment receipt',
    canActivate: [roleGuard],
    data: { roles: adminOnly() },
    loadComponent: () => import('./pages/receipt-page').then((m) => m.ReceiptPage),
  },
  {
    path: 'statement',
    title: 'Customer statement',
    canActivate: [roleGuard],
    data: { roles: adminOnly() },
    loadComponent: () => import('./pages/statement-page').then((m) => m.StatementPage),
  },
];
