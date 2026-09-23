import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { AuthService } from './core/auth/auth.service';
import { featureRoute } from './core/config/route-helpers';
import { Shell } from './layout/shell/shell';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).homeRoute() },
      featureRoute('dashboard', () =>
        import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
      ),
      featureRoute('leads', () => import('./features/leads/leads.routes').then((m) => m.LEADS_ROUTES)),
      featureRoute('projects', () =>
        import('./features/projects/projects.routes').then((m) => m.PROJECTS_ROUTES),
      ),
      featureRoute('accounts', () =>
        import('./features/accounts/accounts.routes').then((m) => m.ACCOUNTS_ROUTES),
      ),
      featureRoute('expenses', () =>
        import('./features/expenses/expenses.routes').then((m) => m.EXPENSES_ROUTES),
      ),
      featureRoute('reports', () =>
        import('./features/reports/reports.routes').then((m) => m.REPORTS_ROUTES),
      ),
      featureRoute('team', () => import('./features/team/team.routes').then((m) => m.TEAM_ROUTES)),
      featureRoute('communication', () =>
        import('./features/communication/communication.routes').then((m) => m.COMMUNICATION_ROUTES),
      ),
      featureRoute('settings', () =>
        import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
      ),
    ],
  },
  { path: '**', redirectTo: '' },
];
