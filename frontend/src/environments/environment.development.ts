export const environment = {
  production: false,
  // `ng serve` forwards /api to http://localhost:8000 (see proxy.conf.json).
  apiBaseUrl: '/api/v1',
  // Serve review fixtures for screens whose backend data does not exist yet (dashboard KPIs).
  // Set to false to see the real API (which returns zeros until the leads/projects/accounts models land).
  useMocks: false,
  // Dev only: one-click demo accounts under the login card (filled in, never submitted automatically).
  // environment.ts (production) keeps showDemoLogins false and an empty list, so no credentials ship.
  showDemoLogins: true,
  demoLogins: [
    { label: 'Admin', identifier: 'admin', password: 'Admin@123' },
    { label: 'Sales Manager', identifier: 'sales_manager', password: 'Manager@123' },
    { label: 'Sales Exec', identifier: 'sales_exec', password: 'Exec@123' },
    { label: 'Project Manager', identifier: 'project_manager', password: 'Project@123' },
  ],
};
