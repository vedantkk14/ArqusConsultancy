export const environment = {
  production: false,
  // `ng serve` forwards /api to http://localhost:8000 (see proxy.conf.json).
  apiBaseUrl: '/api/v1',
  // Serve review fixtures for screens whose backend data does not exist yet (dashboard KPIs).
  // Set to false to see the real API (which returns zeros until the leads/projects/accounts models land).
  useMocks: true,
};
