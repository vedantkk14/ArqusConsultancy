export enum Role {
  Admin = 'ADMIN',
  SalesManager = 'SALES_MANAGER',
  SalesExec = 'SALES_EXEC',
  ProjectManager = 'PROJECT_MANAGER',
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.Admin]: 'Admin',
  [Role.SalesManager]: 'Sales Manager',
  [Role.SalesExec]: 'Sales Executive',
  [Role.ProjectManager]: 'Project Manager',
};

/** Where each role lands after login (and when they hit a page they may not open). */
export const ROLE_HOME: Record<Role, string> = {
  [Role.Admin]: '/dashboard',
  [Role.SalesManager]: '/dashboard',
  [Role.SalesExec]: '/leads/all',
  [Role.ProjectManager]: '/projects/running',
};
