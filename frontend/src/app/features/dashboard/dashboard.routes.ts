import { Routes } from '@angular/router';
import { DashboardPage } from './dashboard-page';
import { salesManagerDashboardMatch } from './sales-manager/sales-manager-match.guard';

// Role dispatch for the shared '/dashboard' home. A Sales Manager gets their own team
// dashboard; every other role keeps falling through to the admin page below (unchanged -
// it currently shows its own "your dashboard is on the way" empty state for non-admins).
export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    title: 'Team dashboard',
    canMatch: [salesManagerDashboardMatch],
    loadComponent: () =>
      import('./sales-manager/sales-manager-dashboard.page').then((m) => m.SalesManagerDashboardPage),
  },
  { path: '', title: 'Dashboard', component: DashboardPage },
];
