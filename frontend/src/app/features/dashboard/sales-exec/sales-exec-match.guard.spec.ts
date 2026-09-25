import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CanMatchFn, provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { salesExecDashboardMatch } from './sales-exec-match.guard';

describe('salesExecDashboardMatch', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  function loginAs(role: Role): void {
    const user = { id: 1, name: 'T', email: 't@x.com', role };
    TestBed.inject(AuthService).login('t', 'pw').subscribe();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/login')
      .flush({ access: 'A', refresh: 'R', user });
  }

  const run = (guard: CanMatchFn) =>
    TestBed.runInInjectionContext(() => guard({} as never, [] as never, {} as never));

  it('matches a Sales Exec', () => {
    loginAs(Role.SalesExec);
    expect(run(salesExecDashboardMatch)).toBe(true);
  });

  it('does not match Admin', () => {
    loginAs(Role.Admin);
    expect(run(salesExecDashboardMatch)).toBe(false);
  });

  it('does not match Sales Manager', () => {
    loginAs(Role.SalesManager);
    expect(run(salesExecDashboardMatch)).toBe(false);
  });

  it('does not match Project Manager', () => {
    loginAs(Role.ProjectManager);
    expect(run(salesExecDashboardMatch)).toBe(false);
  });
});
