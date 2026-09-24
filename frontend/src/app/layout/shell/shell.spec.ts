import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/models';
import { filterPages } from '../command-palette/command-palette';
import { LayoutService } from '../layout.service';
import { fakeBreakpoints } from '../testing/fake-breakpoints';
import { pagesForRole } from '../nav-helpers';
import { Shell } from './shell';

function render(width = 1440) {
  localStorage.clear();
  TestBed.configureTestingModule({
    imports: [Shell],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      fakeBreakpoints(width),
    ],
  });
  TestBed.inject(AuthService).login('a', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Alice Admin', email: 'a@x.com', role: Role.Admin } });
  const fixture = TestBed.createComponent(Shell);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, layout: TestBed.inject(LayoutService) };
}

/** Keydown with the legacy keyCode set (CDK menus read keyCode). */
function keydown(target: EventTarget, key: string, keyCode: number): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => keyCode });
  target.dispatchEvent(event);
}

const press = (key: string, mods: KeyboardEventInit = { ctrlKey: true }) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mods }));

describe('Shell and sidebar', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => (n.innerHTML = '')));

  it('Ctrl+B and Cmd+B toggle the sidebar; the toggle button reflects the state', () => {
    const { fixture, el, layout } = render();
    const toggle = () => el.querySelector<HTMLButtonElement>('.toggle')!;
    expect(layout.collapsed()).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Collapse sidebar');

    press('b');
    fixture.detectChanges();
    expect(layout.collapsed()).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Expand sidebar');
    expect(getComputedStyle(el).getPropertyValue('--sidebar-w')).toBe('72px');

    press('b', { metaKey: true });
    fixture.detectChanges();
    expect(layout.collapsed()).toBe(false);
  });

  it('clicking the header toggle collapses to a rail with the emblem', () => {
    const { fixture, el } = render();
    el.querySelector<HTMLButtonElement>('.toggle')!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-sidebar')!.classList).toContain('rail');
    expect(el.querySelector('.brand-text')).toBeNull(); // rail shows the emblem only
    expect(el.querySelector('.rail-toggle .toggle')).not.toBeNull();
  });

  it('rail icons carry an accessible name and a tooltip with the label', () => {
    const { fixture, el } = render();
    press('b');
    fixture.detectChanges();
    const items = fixture.debugElement.queryAll(By.css('.rail-item'));
    expect(items.length).toBe(9);
    for (const item of items) {
      const label = item.nativeElement.getAttribute('aria-label');
      expect(label).toBeTruthy();
      expect(item.injector.get(MatTooltip).message).toBe(label);
    }
    expect(el.querySelector('nav[aria-label="Main"]')).not.toBeNull();
  });

  it('a rail group opens its flyout from the keyboard and Escape closes it, returning focus', async () => {
    const { fixture, el } = render();
    press('b');
    fixture.detectChanges();
    const leads = el.querySelector<HTMLButtonElement>('.rail-item[aria-label="Leads"]')!;
    leads.focus();
    // Synthetic (untrusted) Enter: the CDK trigger opens the flyout itself and focuses the first item.
    keydown(leads, 'Enter', 13);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(leads.getAttribute('aria-expanded')).toBe('true');
    const flyout = document.querySelector<HTMLElement>('.flyout')!;
    expect(flyout).not.toBeNull();
    expect([...flyout.querySelectorAll('.flyout-item')].map((a) => a.textContent?.trim())).toEqual([
      'All Leads',
      'Add New Lead',
      'Overdue Follow-ups',
      'Won Leads',
      'Lost Leads',
    ]);

    keydown(document.activeElement ?? flyout, 'Escape', 27);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelector('.flyout')).toBeNull();
    expect(document.activeElement).toBe(leads);
  });

  it('expanded groups are accordions with only one open at a time', () => {
    const { fixture, el } = render();
    const group = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button.item')].find((b) => b.textContent?.includes(label))!;
    group('Leads').click();
    fixture.detectChanges();
    expect(group('Leads').getAttribute('aria-expanded')).toBe('true');
    group('Projects').click();
    fixture.detectChanges();
    expect(group('Leads').getAttribute('aria-expanded')).toBe('false');
    expect(group('Projects').getAttribute('aria-expanded')).toBe('true');
  });

  it('below 1024px there is no sidebar or toggle, and a bottom tab bar with More', () => {
    const { el } = render(800);
    expect(el.querySelector('app-sidebar')).toBeNull();
    expect(el.querySelector('.toggle')).toBeNull();
    const tabs = [...el.querySelectorAll('.tabbar .tab span')].map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Dashboard', 'Leads', 'Projects', 'Accounts', 'More']);
  });

  it('the command palette filters role-visible pages', () => {
    const pm = pagesForRole(Role.ProjectManager);
    expect(pm.some((p) => p.route.startsWith('/accounts'))).toBe(false);
    expect(filterPages(pm, 'budget')).toEqual([]); // Budget Alerts is admin-only
    expect(filterPages(pagesForRole(Role.Admin), 'budget').map((p) => p.label)).toEqual(['Budget Alerts']);
    expect(filterPages(pagesForRole(Role.Admin), 'reports').length).toBe(4); // matches the group name
  });
});

describe('Personal header', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((n) => (n.innerHTML = '')));

  it('greets the user by first name and shows their role on every page', () => {
    const { el } = render();
    const meta = el.querySelector('.topbar .who')!.textContent!.replace(/\s+/g, ' ');
    expect(meta).toContain('Hi, Alice');
    expect(meta).toContain('Admin');
    expect(el.querySelector('.topbar app-role-badge')).not.toBeNull();
    expect(el.querySelector('app-sidebar-user app-role-badge')).not.toBeNull();
  });

  it('welcomes the user once per sign-in', () => {
    sessionStorage.clear();
    render();
    const toast = () => document.querySelector('.mat-mdc-snack-bar-container')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(toast()).toMatch(/Good (morning|afternoon|evening), Alice\. You're signed in as Admin\./);
    expect(sessionStorage.getItem('crm.welcomed.1')).toBe('1');
  });

  it('does not repeat the welcome on a refresh in the same session', () => {
    sessionStorage.setItem('crm.welcomed.1', '1');
    render();
    expect(document.querySelector('.mat-mdc-snack-bar-container')).toBeNull();
  });
});
