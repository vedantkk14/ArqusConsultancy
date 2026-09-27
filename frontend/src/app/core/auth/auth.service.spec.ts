import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Role } from '../models';
import { AuthService } from './auth.service';
import { TokenStorage } from './token-storage';

const USER = { id: 1, name: 'Alice Admin', email: 'a@x.com', role: Role.Admin, must_change_password: false };

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let storage: TokenStorage;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(TokenStorage);
  });

  afterEach(() => http.verify());

  function login(remember: boolean, mustChange = false) {
    auth.login('admin@x.com', 'pw', remember).subscribe();
    const req = http.expectOne('/api/v1/auth/login');
    expect(req.request.body).toEqual({ identifier: 'admin@x.com', password: 'pw' });
    req.flush({ access: 'A', refresh: 'R', user: { ...USER, must_change_password: mustChange }, must_change_password: mustChange });
  }

  it('"Remember me" on stores the tokens in localStorage', () => {
    login(true);
    expect(localStorage.getItem('crm.access')).toBe('A');
    expect(localStorage.getItem('crm.refresh')).toBe('R');
    expect(sessionStorage.getItem('crm.refresh')).toBeNull();
    expect(auth.user()?.name).toBe('Alice Admin');
    expect(auth.homeRoute()).toBe('/dashboard');
  });

  it('"Remember me" off stores the tokens in sessionStorage only', () => {
    login(false);
    expect(sessionStorage.getItem('crm.access')).toBe('A');
    expect(sessionStorage.getItem('crm.refresh')).toBe('R');
    expect(localStorage.getItem('crm.refresh')).toBeNull();
  });

  it('refresh rotation keeps the storage the session started in', () => {
    login(true);
    auth.refreshAccessToken().subscribe();
    http.expectOne('/api/v1/auth/refresh').flush({ access: 'A2', refresh: 'R2' });
    expect(localStorage.getItem('crm.refresh')).toBe('R2');
    expect(sessionStorage.getItem('crm.refresh')).toBeNull();
  });

  it('logout clears everything and calls the API exactly once', () => {
    login(true);
    auth.logout();
    const req = http.expectOne('/api/v1/auth/logout');
    expect(req.request.body).toEqual({ refresh: 'R' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(storage.access).toBeNull();
    expect(storage.refresh).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    http.expectNone('/api/v1/auth/logout');
  });

  it('a forced account goes to the change-password page after login', () => {
    login(false, true);
    expect(auth.mustChangePassword()).toBe(true);
    expect(auth.afterLoginUrl('/leads')).toBe('/account/change-password?forced=true');
  });

  it('after login it prefers a safe returnUrl, else the role home', () => {
    login(false);
    expect(auth.afterLoginUrl('/leads/all')).toBe('/leads/all');
    expect(auth.afterLoginUrl('//evil.com')).toBe('/dashboard');
  });

  it('loadSession hydrates the user from /me', async () => {
    storage.set({ access: 'A', refresh: 'R' }, true);
    const done = auth.loadSession();
    http.expectOne('/api/v1/me').flush({ ...USER, role: Role.SalesManager });
    await done;
    expect(auth.role()).toBe(Role.SalesManager);
  });

  it('loadSession clears a rejected session quietly', async () => {
    storage.set({ access: 'A', refresh: 'R' }, true);
    const done = auth.loadSession();
    http.expectOne('/api/v1/me').flush({ error: { code: 'token_invalid' } }, { status: 401, statusText: 'Unauthorized' });
    await done;
    expect(auth.isAuthenticated()).toBe(false);
    expect(storage.refresh).toBeNull();
  });

  it('changePassword stores the new tokens and clears the flag', () => {
    login(false, true);
    auth.changePassword('old', 'new').subscribe();
    const req = http.expectOne('/api/v1/auth/password/change');
    expect(req.request.body).toEqual({ old_password: 'old', new_password: 'new' });
    req.flush({ access: 'A2', refresh: 'R2', user: USER, must_change_password: false });
    expect(storage.refresh).toBe('R2');
    expect(auth.mustChangePassword()).toBe(false);
  });
});
