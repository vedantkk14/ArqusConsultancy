import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/models';
import { DashboardPage } from './dashboard-page';

function render(role: Role, name: string): HTMLElement {
  TestBed.configureTestingModule({
    imports: [DashboardPage],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name, email: 'x@x.com', role } });

  const fixture = TestBed.createComponent(DashboardPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const tileNames = (el: HTMLElement) =>
  [...el.querySelectorAll('.tile strong')].map((e) => e.textContent?.trim());
const stepStates = (el: HTMLElement) =>
  [...el.querySelectorAll('.step')].map((e) => e.classList.contains('locked'));

describe('DashboardPage', () => {
  beforeEach(() => localStorage.clear());

  it('greets the user by first name and shows their role', () => {
    const el = render(Role.Admin, 'Alice Admin');
    expect(el.querySelector('h1')?.textContent).toContain('Alice');
    expect(el.querySelector('.eyebrow')?.textContent?.trim()).toBe('Admin');
  });

  it('shows every workspace to an admin and unlocks the whole deal flow', () => {
    const el = render(Role.Admin, 'Alice Admin');
    expect(tileNames(el)).toEqual([
      'Leads',
      'Projects',
      'Accounts',
      'Expenses',
      'Reports',
      'Team',
      'Communication',
      'Settings',
    ]);
    expect(stepStates(el)).toEqual([false, false, false, false, false]);
  });

  it('hides Accounts, Reports and Team from a project manager and locks the money steps', () => {
    const el = render(Role.ProjectManager, 'Paul Project');
    expect(tileNames(el)).toEqual(['Projects', 'Expenses', 'Communication', 'Settings']);
    // Lead, Won deal locked; Project open; Payments & expenses open via Expenses; Margin locked
    expect(stepStates(el)).toEqual([true, true, false, false, true]);
  });
});
