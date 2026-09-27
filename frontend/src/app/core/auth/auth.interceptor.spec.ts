import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { TokenStorage } from './token-storage';

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let storage: TokenStorage;
  let auth: AuthService;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(TokenStorage);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    await auth.loadSession(); // no tokens yet: just marks startup as finished
    await router.navigateByUrl('/leads/all?status=open');
  });

  afterEach(() => ctrl.verify());

  const unauthorized = { status: 401, statusText: 'Unauthorized' };

  it('adds the bearer token to our API only', () => {
    storage.set({ access: 'A1', refresh: 'R1' });
    http.get('/api/v1/leads').subscribe();
    http.get('https://maps.example.com/api/v1/tiles').subscribe();
    http.get('/api/v10/other').subscribe();
    expect(ctrl.expectOne('/api/v1/leads').request.headers.get('Authorization')).toBe('Bearer A1');
    expect(ctrl.expectOne('https://maps.example.com/api/v1/tiles').request.headers.has('Authorization')).toBe(false);
    expect(ctrl.expectOne('/api/v10/other').request.headers.has('Authorization')).toBe(false);
  });

  it.each(['login', 'refresh', 'logout', 'password/forgot', 'password/reset'])(
    'never adds a token to /auth/%s',
    (path) => {
      storage.set({ access: 'A1', refresh: 'R1' });
      http.post(`/api/v1/auth/${path}`, {}).subscribe({ error: () => undefined });
      const req = ctrl.expectOne(`/api/v1/auth/${path}`);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({}, unauthorized); // a 401 here must not trigger a refresh either
      ctrl.expectNone('/api/v1/auth/refresh');
    },
  );

  it('three parallel 401s share ONE refresh and all three retry with the new token', () => {
    storage.set({ access: 'OLD', refresh: 'R1' });
    const results: unknown[] = [];
    for (const path of ['a', 'b', 'c']) {
      http.get(`/api/v1/${path}`).subscribe((r) => results.push(r));
    }
    for (const path of ['a', 'b', 'c']) {
      ctrl.expectOne(`/api/v1/${path}`).flush({}, unauthorized);
    }
    const refresh = ctrl.expectOne('/api/v1/auth/refresh'); // exactly one
    expect(refresh.request.body).toEqual({ refresh: 'R1' });
    refresh.flush({ access: 'NEW', refresh: 'R2' });

    for (const path of ['a', 'b', 'c']) {
      const retry = ctrl.expectOne(`/api/v1/${path}`);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer NEW');
      retry.flush({ path });
    }
    expect(results).toEqual([{ path: 'a' }, { path: 'b' }, { path: 'c' }]);
    expect(storage.refresh).toBe('R2'); // rotated refresh token stored
  });

  it('a failed refresh clears the session and goes to /login?reason=expired with the returnUrl', async () => {
    storage.set({ access: 'OLD', refresh: 'BAD' });
    let failed = false;
    http.get('/api/v1/leads').subscribe({ error: () => (failed = true) });
    ctrl.expectOne('/api/v1/leads').flush({}, unauthorized);
    ctrl.expectOne('/api/v1/auth/refresh').flush({ error: { code: 'token_invalid' } }, unauthorized);
    await TestBed.inject(Router).navigated;
    await new Promise((r) => setTimeout(r));

    expect(failed).toBe(true);
    expect(storage.access).toBeNull();
    expect(storage.refresh).toBeNull();
    expect(router.url).toBe('/login?reason=expired&returnUrl=%2Fleads%2Fall%3Fstatus%3Dopen');
  });

  it('never loops: a 401 after the retry is returned, with no second refresh', () => {
    storage.set({ access: 'OLD', refresh: 'R1' });
    let status = 0;
    http.get('/api/v1/leads').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/v1/leads').flush({}, unauthorized);
    ctrl.expectOne('/api/v1/auth/refresh').flush({ access: 'NEW', refresh: 'R2' });
    ctrl.expectOne('/api/v1/leads').flush({}, unauthorized);
    ctrl.expectNone('/api/v1/auth/refresh');
    expect(status).toBe(401);
  });

  it('without a refresh token the session is expired straight away', () => {
    storage.set({ access: 'OLD' }, false);
    sessionStorage.removeItem('crm.refresh');
    http.get('/api/v1/leads').subscribe({ error: () => undefined });
    ctrl.expectOne('/api/v1/leads').flush({}, unauthorized);
    ctrl.expectNone('/api/v1/auth/refresh');
    expect(storage.access).toBeNull();
  });
});
