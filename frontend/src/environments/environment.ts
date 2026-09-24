export const environment = {
  production: true,
  // Same-origin by default. Point this at the real API host (e.g. https://api.example.com/api/v1)
  // when the frontend and backend are deployed on different origins.
  apiBaseUrl: '/api/v1',
  useMocks: false,
  showDemoLogins: false,
  demoLogins: [] as { label: string; identifier: string; password: string }[],
};
