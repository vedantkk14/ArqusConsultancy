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
