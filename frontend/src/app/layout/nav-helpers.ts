import { Role } from '../core/models';
import { NavItem, SIDEBAR_CONFIG, filterNavByRole } from '../core/config/sidebar.config';

/** A single navigable page (leaf) with the label of the group it belongs to. */
export interface NavPage {
  label: string;
  icon: string;
  route: string;
  group: string | null;
}

/** Every page the role can open, in sidebar order. Used by the command palette and the "More" sheet. */
export function pagesForRole(role: Role | null | undefined, items: NavItem[] = SIDEBAR_CONFIG): NavPage[] {
  return filterNavByRole(items, role).flatMap((item): NavPage[] =>
    item.children?.length
      ? item.children.map((c) => ({ label: c.label, icon: c.icon, route: c.route, group: item.label }))
      : [{ label: item.label, icon: item.icon, route: item.route, group: null }],
  );
}

/** Where a top-level item leads: itself, or its first child the role can see. */
export function entryRoute(item: NavItem): string {
  return item.children?.[0]?.route ?? item.route;
}
