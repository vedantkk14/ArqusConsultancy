import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Role } from '../models';
import { authGuard, guestGuard, mustChangePasswordGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

function routeWith(roles?: Role[]): ActivatedRouteSnapshot {
  return { data: { roles } } as unknown as ActivatedRouteSnapshot;
}

describe('guards', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  function loginAs(role: Role, mustChange = false): void {
    const user = { id: 1, name: 'T', email: 't@x.com', role, must_change_password: mustChange };
    TestBed.inject(AuthService).login('t', 'pw').subscribe();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/login')
      .flush({ access: 'A', refresh: 'R', user, must_change_password: mustChange });
  }

  const run = (guard: CanActivateFn, url = '/x', route = routeWith()) =>
    TestBed.runInInjectionContext(() => guard(route, { url } as RouterStateSnapshot));
  const target = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('roleGuard allows a listed role', () => {
    loginAs(Role.Admin);
    expect(run(roleGuard, '/x', routeWith([Role.Admin]))).toBe(true);
  });

  it('roleGuard allows any user when the route lists no roles', () => {
    loginAs(Role.SalesExec);
    expect(run(roleGuard)).toBe(true);
  });

  it('roleGuard redirects an unlisted role to its home', () => {
    loginAs(Role.ProjectManager);
    expect(target(run(roleGuard, '/x', routeWith([Role.Admin])))).toBe('/dashboard');
  });

  it('authGuard sends anonymous users to /login with the returnUrl', () => {
    expect(target(run(authGuard))).toBe('/login?returnUrl=%2Fx');
  });

  it('authGuard lets signed-in users through', () => {
    loginAs(Role.Admin);
    expect(run(authGuard)).toBe(true);
  });

  it('guestGuard lets anonymous users see /login', () => {
    expect(run(guestGuard, '/login')).toBe(true);
  });

  it('guestGuard sends a signed-in user home, or to the forced change', () => {
    loginAs(Role.SalesManager);
    expect(target(run(guestGuard, '/login'))).toBe('/dashboard');
  });

  it('guestGuard sends a forced user to the change-password page', () => {
    loginAs(Role.SalesExec, true);
    expect(target(run(guestGuard, '/login'))).toBe('/account/change-password?forced=true');
  });

  it('mustChangePasswordGuard blocks every other page while the flag is set', () => {
    loginAs(Role.SalesExec, true);
    expect(target(run(mustChangePasswordGuard, '/leads/all'))).toBe('/account/change-password?forced=true');
    expect(target(run(mustChangePasswordGuard, '/dashboard'))).toBe('/account/change-password?forced=true');
    expect(run(mustChangePasswordGuard, '/account/change-password?forced=true')).toBe(true);
  });

  it('mustChangePasswordGuard does nothing for normal accounts', () => {
    loginAs(Role.SalesExec);
    expect(run(mustChangePasswordGuard, '/leads/all')).toBe(true);
  });
});
