import { Routes } from '@angular/router';
import { findNavItem, placeholderRoutes } from '../../core/config/route-helpers';
import { roleGuard } from '../../core/auth/role.guard';

// Real pages come before the placeholders with the same path (Notifications is still a placeholder).
export const COMMUNICATION_ROUTES: Routes = [
  {
    path: 'whatsapp-templates',
    title: 'WhatsApp Templates',
    canActivate: [roleGuard],
    data: { roles: findNavItem('/communication/whatsapp-templates')?.roles },
    loadComponent: () => import('./pages/templates-page').then((m) => m.TemplatesPage),
  },
  {
    path: 'message-log',
    title: 'Message Log',
    canActivate: [roleGuard],
    data: { roles: findNavItem('/communication/message-log')?.roles },
    loadComponent: () => import('./pages/message-log-page').then((m) => m.MessageLogPage),
  },
  ...placeholderRoutes('/communication').filter((r) => r.path !== 'whatsapp-templates' && r.path !== 'message-log'),
];
