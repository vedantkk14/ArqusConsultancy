import { Route, Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem, placeholderRoutes } from '../../core/config/route-helpers';

function page(path: string, title: string, load: () => Promise<unknown>): Route {
  return {
    path,
    title,
    canActivate: [roleGuard],
    data: { roles: findNavItem(`/reports/${path}`)?.roles },
    loadComponent: load as Route['loadComponent'],
  };
}

export const REPORTS_ROUTES: Routes = [
  page('sales', 'Sales report', () => import('./sales/sales-report').then((m) => m.SalesReportPage)),
  page('financial-health', 'Financial health', () => import('./financial/financial-report').then((m) => m.FinancialReportPage)),
  page('project-margin', 'Project margin', () => import('./margin/margin-report').then((m) => m.MarginReportPage)),
  page('lead-funnel', 'Lead funnel report', () => import('./funnel/funnel-report').then((m) => m.FunnelReportPage)),
  ...placeholderRoutes('/reports').filter((r) => r.path === ''),
];
