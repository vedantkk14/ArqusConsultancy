import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, guestGuard, mustChangePasswordGuard } from './core/auth/auth.guard';
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
    path: 'forgot-password',
    title: 'Forgot password',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password/:uid/:token',
    title: 'Set a new password',
    // No guestGuard: a reset link must work even in a browser that is signed in.
    loadComponent: () => import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'account/change-password',
    title: 'Change password',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/change-password-page').then((m) => m.ChangePasswordPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard, mustChangePasswordGuard],
    canActivateChild: [mustChangePasswordGuard],
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
