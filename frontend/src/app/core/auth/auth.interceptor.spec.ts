import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { TokenStorage } from './token-storage';

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let storage: TokenStorage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(TokenStorage);
  });

  afterEach(() => ctrl.verify());

  it('adds the bearer token to API calls', () => {
    storage.set('A1', 'R1');
    http.get('/api/v1/leads').subscribe();
    const req = ctrl.expectOne('/api/v1/leads');
    expect(req.request.headers.get('Authorization')).toBe('Bearer A1');
    req.flush({});
  });

  it('does not add a token to login', () => {
    storage.set('A1', 'R1');
    http.post('/api/v1/auth/login', {}).subscribe();
    const req = ctrl.expectOne('/api/v1/auth/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('refreshes once on 401 and retries the request with the new token', () => {
    storage.set('OLD', 'R1');
    let result: unknown;
    http.get('/api/v1/leads').subscribe((r) => (result = r));

    ctrl.expectOne('/api/v1/leads').flush({}, { status: 401, statusText: 'Unauthorized' });

    const refresh = ctrl.expectOne('/api/v1/auth/refresh');
    expect(refresh.request.body).toEqual({ refresh: 'R1' });
    refresh.flush({ access: 'NEW' });

    const retry = ctrl.expectOne('/api/v1/leads');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer NEW');
    retry.flush({ ok: true });

    expect(result).toEqual({ ok: true });
    expect(storage.access).toBe('NEW');
  });

  it('logs out when the refresh token is rejected', () => {
    storage.set('OLD', 'BAD');
    const logout = vi.spyOn(TestBed.inject(AuthService), 'logout').mockImplementation(() => undefined);
    let failed = false;
    http.get('/api/v1/leads').subscribe({ error: () => (failed = true) });

    ctrl.expectOne('/api/v1/leads').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(logout).toHaveBeenCalled();
    expect(failed).toBe(true);
  });
});
