export const environment = {
  production: false,
  // `ng serve` forwards /api to http://localhost:8000 (see proxy.conf.json).
  apiBaseUrl: '/api/v1',
  // The dashboard reads the real API. Set to true only to review the UI against the typed fixture.
  useMocks: false,
  // Shared over a public Cloudflare link: never show the one-click demo accounts.
  showDemoLogins: false,
  demoLogins: [] as { label: string; identifier: string; password: string }[],
};
