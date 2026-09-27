import { inject } from '@angular/core';
import { Route, Routes } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { roleGuard } from '../auth/role.guard';
import { NavItem, SIDEBAR_CONFIG } from './sidebar.config';

/** Finds a sidebar item (group or page) by its route, e.g. '/leads' or '/leads/all'. */
export function findNavItem(route: string, items: NavItem[] = SIDEBAR_CONFIG): NavItem | undefined {
  for (const item of items) {
    if (item.route === route) {
      return item;
    }
    const nested = item.children ? findNavItem(route, item.children) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/** Route entry for a lazy feature area; role access comes from the sidebar config. */
export function featureRoute(path: string, load: () => Promise<Routes>): Route {
  return {
    path,
    canActivate: [roleGuard],
    data: { roles: findNavItem(`/${path}`)?.roles },
    loadChildren: load,
  };
}

/**
 * One lazy "Coming soon" route per child of a sidebar group, guarded by the item's roles.
 * Devs replace a placeholder by putting a real route with the same `path` before it.
 */
export function placeholderRoutes(groupRoute: string): Routes {
  const group = findNavItem(groupRoute);
  const children = group?.children ?? [];

  return [
    {
      path: '',
      pathMatch: 'full',
      // First page of the group that the current user's role may open.
      redirectTo: () => {
        const role = inject(AuthService).role();
        return children.find((c) => role && c.roles.includes(role))?.route ?? '/';
      },
    },
    ...children.map(
      (child): Route => ({
        path: child.route.slice(groupRoute.length + 1),
        title: child.label,
        canActivate: [roleGuard],
        data: { roles: child.roles, title: child.label },
        loadComponent: () =>
          import('../../shared/coming-soon/coming-soon-page').then((m) => m.ComingSoonPage),
      }),
    ),
  ];
}
