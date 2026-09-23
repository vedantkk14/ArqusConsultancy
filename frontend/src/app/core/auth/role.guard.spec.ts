import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Role, User } from '../models';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

function routeWith(roles?: Role[]): ActivatedRouteSnapshot {
  return { data: { roles } } as unknown as ActivatedRouteSnapshot;
}

describe('guards', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  function loginAs(role: Role): void {
    const user: User = { id: 1, name: 'T', email: 't@x.com', role };
    TestBed.inject(AuthService).login('t', 'pw').subscribe();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/login')
      .flush({ access: 'A', refresh: 'R', user });
  }

  const run = (guard: typeof roleGuard, route: ActivatedRouteSnapshot) =>
    TestBed.runInInjectionContext(() => guard(route, { url: '/x' } as RouterStateSnapshot));

  it('roleGuard allows a listed role', () => {
    loginAs(Role.Admin);
    expect(run(roleGuard, routeWith([Role.Admin]))).toBe(true);
  });

  it('roleGuard allows any user when the route lists no roles', () => {
    loginAs(Role.SalesExec);
    expect(run(roleGuard, routeWith())).toBe(true);
  });

  it('roleGuard redirects an unlisted role to its own home', () => {
    loginAs(Role.ProjectManager);
    const result = run(roleGuard, routeWith([Role.Admin])) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/projects/running');
  });

  it('authGuard redirects anonymous users to /login with returnUrl', () => {
    const result = run(authGuard, routeWith()) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login?returnUrl=%2Fx');
  });
});
