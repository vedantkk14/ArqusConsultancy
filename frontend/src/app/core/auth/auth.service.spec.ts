import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Role } from '../models';
import { AuthService } from './auth.service';
import { TokenStorage } from './token-storage';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let storage: TokenStorage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'login', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(TokenStorage);
  });

  afterEach(() => http.verify());

  it('stores tokens and exposes the user after login', () => {
    const user = { id: 1, name: 'Alice Admin', email: 'a@x.com', role: Role.Admin };
    auth.login('admin', 'pw').subscribe();

    const req = http.expectOne('/api/v1/auth/login');
    expect(req.request.body).toEqual({ username: 'admin', password: 'pw' });
    req.flush({ access: 'A', refresh: 'R', user });

    expect(storage.access).toBe('A');
    expect(storage.refresh).toBe('R');
    expect(auth.user()).toEqual(user);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.homeRoute()).toBe('/dashboard');
  });

  it('sends a project manager to their own home page', () => {
    auth.login('pm', 'pw').subscribe();
    http.expectOne('/api/v1/auth/login').flush({
      access: 'A',
      refresh: 'R',
      user: { id: 4, name: 'Paul', email: 'p@x.com', role: Role.ProjectManager },
    });
    expect(auth.homeRoute()).toBe('/projects/running');
  });

  it('clears everything on logout', () => {
    storage.set('A', 'R');
    auth.logout();
    expect(storage.access).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('restores the session from a stored token', async () => {
    storage.set('A', 'R');
    const done = auth.restoreSession();
    http.expectOne('/api/v1/me').flush({ id: 2, name: 'Sam', email: 's@x.com', role: Role.SalesManager });
    await done;
    expect(auth.role()).toBe(Role.SalesManager);
  });
});
