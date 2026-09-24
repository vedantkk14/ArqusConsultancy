import { Role } from '../models';

/**
 * Where each role lands after sign-in, and where roleGuard sends a role that may not open a page.
 * Everyone starts on /dashboard; the dashboard itself decides what each role sees.
 */
export const ROLE_HOME: Record<Role, string> = {
  [Role.Admin]: '/dashboard',
  [Role.SalesManager]: '/dashboard',
  [Role.SalesExec]: '/dashboard',
  [Role.ProjectManager]: '/dashboard',
};
