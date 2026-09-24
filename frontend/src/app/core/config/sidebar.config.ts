import { Role } from '../models';

export interface NavItem {
  label: string;
  /** Material Symbols icon name. */
  icon: string;
  route: string;
  /** Roles that can see this item and open its route. */
  roles: Role[];
  children?: NavItem[];
}

const { Admin, SalesManager, SalesExec, ProjectManager } = Role;
const ALL = [Admin, SalesManager, SalesExec, ProjectManager];

/**
 * The ONE source of truth for navigation AND route access.
 * - The sidebar renders it (filtered by the logged-in user's role).
 * - Each feature's `*.routes.ts` builds its placeholder routes + role guard data from it.
 * To add a page: add an item here, then replace its placeholder in the feature routes file.
 * A group's `roles` must include every role of its children (covered by a unit test).
 */
export const SIDEBAR_CONFIG: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', route: '/dashboard', roles: ALL },
  {
    label: 'Leads',
    icon: 'contacts',
    route: '/leads',
    roles: [Admin, SalesManager, SalesExec],
    children: [
      { label: 'All Leads', icon: 'list', route: '/leads/all', roles: [Admin, SalesManager, SalesExec] },
      { label: 'Add New Lead', icon: 'person_add', route: '/leads/new', roles: [Admin, SalesManager] },
      { label: 'Overdue Follow-ups', icon: 'event_busy', route: '/leads/overdue', roles: [Admin, SalesManager, SalesExec] },
      { label: 'Won Leads', icon: 'emoji_events', route: '/leads/won', roles: [Admin, SalesManager, SalesExec] },
      { label: 'Lost Leads', icon: 'thumb_down', route: '/leads/lost', roles: [Admin, SalesManager, SalesExec] },
    ],
  },
  {
    label: 'Projects',
    icon: 'assignment',
    route: '/projects',
    roles: [Admin, SalesManager, ProjectManager],
    children: [
      { label: 'Convert Won Lead', icon: 'transform', route: '/projects/convert', roles: [Admin, SalesManager] },
      { label: 'Running', icon: 'play_circle', route: '/projects/running', roles: [Admin, SalesManager, ProjectManager] },
      { label: 'Completed', icon: 'check_circle', route: '/projects/completed', roles: [Admin, SalesManager, ProjectManager] },
    ],
  },
  {
    label: 'Accounts',
    icon: 'account_balance',
    route: '/accounts',
    roles: [Admin, SalesManager],
    children: [
      { label: 'Customer Ledgers', icon: 'menu_book', route: '/accounts/ledgers', roles: [Admin] },
      { label: 'Payment Entries', icon: 'payments', route: '/accounts/payments', roles: [Admin] },
      { label: 'Customer Statement', icon: 'receipt_long', route: '/accounts/statement', roles: [Admin] },
      { label: 'Pending Collections', icon: 'pending_actions', route: '/accounts/pending', roles: [Admin, SalesManager] },
    ],
  },
  {
    label: 'Expenses',
    icon: 'request_quote',
    route: '/expenses',
    roles: [Admin, ProjectManager],
    children: [
      { label: 'All Expenses', icon: 'receipt', route: '/expenses/all', roles: [Admin, ProjectManager] },
      { label: 'Budget Alerts', icon: 'warning', route: '/expenses/alerts', roles: [Admin, ProjectManager] },
    ],
  },
  {
    label: 'Reports',
    icon: 'bar_chart',
    route: '/reports',
    roles: [Admin, SalesManager],
    children: [
      { label: 'Sales', icon: 'trending_up', route: '/reports/sales', roles: [Admin, SalesManager] },
      { label: 'Financial Health', icon: 'monitor_heart', route: '/reports/financial-health', roles: [Admin] },
      { label: 'Project Margin', icon: 'percent', route: '/reports/project-margin', roles: [Admin] },
      { label: 'Lead Funnel', icon: 'filter_alt', route: '/reports/lead-funnel', roles: [Admin, SalesManager] },
    ],
  },
  {
    label: 'Team',
    icon: 'groups',
    route: '/team',
    roles: [Admin, SalesManager],
    children: [
      { label: 'Users', icon: 'person', route: '/team/users', roles: [Admin] },
      { label: 'Roles', icon: 'admin_panel_settings', route: '/team/roles', roles: [Admin] },
      { label: 'Commission Rates', icon: 'sell', route: '/team/commission-rates', roles: [Admin] },
      { label: 'Assignments', icon: 'assignment_ind', route: '/team/assignments', roles: [Admin, SalesManager] },
    ],
  },
  {
    label: 'Communication',
    icon: 'forum',
    route: '/communication',
    roles: ALL,
    children: [
      { label: 'WhatsApp Templates', icon: 'chat', route: '/communication/whatsapp-templates', roles: [Admin, SalesManager, SalesExec] },
      { label: 'Message Log', icon: 'history', route: '/communication/message-log', roles: [Admin, SalesManager, SalesExec] },
      { label: 'Notifications', icon: 'notifications', route: '/communication/notifications', roles: ALL },
    ],
  },
  {
    label: 'Settings',
    icon: 'settings',
    route: '/settings',
    roles: ALL,
    children: [
      { label: 'Master Data', icon: 'database', route: '/settings/master-data', roles: [Admin] },
      { label: 'Audit Log', icon: 'fact_check', route: '/settings/audit-log', roles: [Admin] },
      { label: 'Profile', icon: 'account_circle', route: '/settings/profile', roles: ALL },
    ],
  },
];

/** Items (and children) visible to `role`. A group with no visible children is dropped. */
export function filterNavByRole(items: NavItem[], role: Role | null | undefined): NavItem[] {
  if (!role) {
    return [];
  }
  return items
    .filter((item) => item.roles.includes(role))
    .map((item) => (item.children ? { ...item, children: filterNavByRole(item.children, role) } : item))
    .filter((item) => !item.children || item.children.length > 0);
}
