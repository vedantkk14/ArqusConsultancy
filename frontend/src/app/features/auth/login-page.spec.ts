import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LoginPage } from './login-page';

async function setup(url = '/login') {
  localStorage.clear();
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'login', component: LoginPage },
        { path: '**', children: [] },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, LoginPage);
  const el = harness.routeNativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  const type = (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = () => {
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    harness.detectChanges();
  };
  const fill = () => {
    type('#identifier', 'admin');
    type('#password', 'secret-pass');
  };
  const button = () => el.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const banner = () => el.querySelector('.banner.error')?.textContent?.replace(/\s+/g, ' ').replace('error_outline', '').trim();
  const failWith = (code: string, status: number, details: Record<string, unknown> = {}) => {
    http.expectOne('/api/v1/auth/login').flush({ error: { code, message: 'x', details } }, { status, statusText: 'E' });
    harness.detectChanges();
  };
  return { harness, el, http, type, submit, fill, button, banner, failWith };
}

describe('LoginPage', () => {
  afterEach(() => vi.useRealTimers());

  it('uses real labels and password-manager friendly attributes', async () => {
    const { el } = await setup();
    const id = el.querySelector<HTMLInputElement>('#identifier')!;
    expect(el.querySelector('label[for=identifier]')?.textContent).toContain('Email or username');
    expect(id.getAttribute('autocomplete')).toBe('username');
    expect(id.getAttribute('autocapitalize')).toBe('none');
    expect(id.getAttribute('spellcheck')).toBe('false');
    expect(el.querySelector('#password')!.getAttribute('autocomplete')).toBe('current-password');
    expect(el.querySelectorAll('h1').length).toBe(1);
  });

  it('shows required errors on submit, links them with aria-describedby and sends nothing', async () => {
    const { el, submit, http } = await setup();
    submit();
    expect(el.querySelector('#identifier-error')?.textContent).toContain('Enter your email or username');
    expect(el.querySelector('#password-error')?.textContent).toContain('Enter your password');
    expect(el.querySelector('#identifier')!.getAttribute('aria-describedby')).toBe('identifier-error');
    expect(el.querySelector('#identifier')!.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement?.id).toBe('identifier');
    http.expectNone('/api/v1/auth/login');
  });

  it('disables the button and ignores double submits while signing in', async () => {
    const { fill, submit, button, http } = await setup();
    fill();
    submit();
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('Signing in…');
    submit();
    expect(http.match('/api/v1/auth/login').length).toBe(1);
  });

  it.each([
    ['invalid_credentials', 401, 'Incorrect email or password.'],
    ['account_disabled', 403, 'This account is disabled. Contact your administrator.'],
    ['server_error', 500, 'Something went wrong. Please try again.'],
  ])('maps %s to a friendly message', async (code, status, text) => {
    const { fill, submit, failWith, banner, el } = await setup();
    fill();
    submit();
    failWith(code, status);
    expect(banner()).toBe(text);
    expect(el.querySelector('.banner.error')!.getAttribute('role')).toBe('alert');
  });

  it('shows the network message when the server cannot be reached', async () => {
    const { fill, submit, http, harness, banner } = await setup();
    fill();
    submit();
    http.expectOne('/api/v1/auth/login').error(new ProgressEvent('error'), { status: 0 });
    harness.detectChanges();
    expect(banner()).toBe("Can't reach the server. Check your connection and try again.");
  });

  it.each(['account_locked', 'too_many_requests'])(
    '%s shows a live countdown and re-enables the form at zero',
    async (code) => {
      const { fill, submit, failWith, banner, button, el, harness } = await setup();
      vi.useFakeTimers();
      fill();
      submit();
      failWith(code, 429, { retry_after: 3 });
      expect(banner()).toContain('Try again in 0:03');
      expect(button().disabled).toBe(true);
      expect(el.querySelector<HTMLInputElement>('#identifier')!.disabled).toBe(true);

      vi.advanceTimersByTime(1000);
      harness.detectChanges();
      expect(banner()).toContain('Try again in 0:02');

      vi.advanceTimersByTime(2000);
      harness.detectChanges();
      expect(banner()).toBeUndefined();
      expect(button().disabled).toBe(false);
      expect(el.querySelector<HTMLInputElement>('#identifier')!.disabled).toBe(false);
    },
  );

  it('toggles password visibility with an accessible button', async () => {
    const { el, harness } = await setup();
    const input = el.querySelector<HTMLInputElement>('#password')!;
    const toggle = el.querySelector<HTMLButtonElement>('.toggle')!;
    expect(input.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
    toggle.click();
    harness.detectChanges();
    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
  });

  it.each([
    ['expired', 'Your session expired. Please sign in again.'],
    ['reset', 'Password updated. Sign in with your new password.'],
  ])('shows the %s notice from the query string', async (reason, text) => {
    const { el } = await setup(`/login?reason=${reason}`);
    expect(el.querySelector('.banner.info')?.textContent).toContain(text);
  });

  it('goes to a safe returnUrl after signing in', async () => {
    const { fill, submit, http } = await setup('/login?returnUrl=%2Fleads%2Fall');
    fill();
    submit();
    http.expectOne('/api/v1/auth/login').flush({
      access: 'A',
      refresh: 'R',
      must_change_password: false,
      user: { id: 1, name: 'A', email: 'a@x.com', role: 'ADMIN', must_change_password: false },
    });
    await new Promise((r) => setTimeout(r));
    expect(TestBed.inject(Router).url).toBe('/leads/all');
  });

  it('sends a forced account to the change-password page', async () => {
    const { fill, submit, http } = await setup('/login?returnUrl=%2Fleads');
    fill();
    submit();
    http.expectOne('/api/v1/auth/login').flush({
      access: 'A',
      refresh: 'R',
      must_change_password: true,
      user: { id: 1, name: 'N', email: 'n@x.com', role: 'SALES_EXEC', must_change_password: true },
    });
    await new Promise((r) => setTimeout(r));
    expect(TestBed.inject(Router).url).toBe('/account/change-password?forced=true');
  });
});
