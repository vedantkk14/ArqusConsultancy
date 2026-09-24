import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { passwordChecks } from './password-rules';
import { ResetPasswordPage } from './reset-password-page';

describe('password rules', () => {
  const ok = (value: string) => Object.fromEntries(passwordChecks(value).map((c) => [c.key, c.ok]));

  it('mirrors the server validators', () => {
    expect(ok('')).toEqual({ length: false, numeric: false, common: false });
    expect(ok('short1')).toEqual({ length: false, numeric: true, common: false });
    expect(ok('12345678901')).toEqual({ length: true, numeric: false, common: true });
    expect(ok('Password123')).toEqual({ length: true, numeric: true, common: false });
    expect(ok('Blue-Harbour-42')).toEqual({ length: true, numeric: true, common: true });
  });
});

describe('ResetPasswordPage', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'reset-password/:uid/:token', component: ResetPasswordPage },
          { path: '**', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/reset-password/MQ/tok-123', ResetPasswordPage);
    const el = harness.routeNativeElement as HTMLElement;
    const type = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      harness.detectChanges();
    };
    const submit = () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      harness.detectChanges();
    };
    const met = () => [...el.querySelectorAll('.checks li')].map((li) => li.classList.contains('ok'));
    return { harness, el, type, submit, met, http: TestBed.inject(HttpTestingController) };
  }

  it('updates the requirements checklist as you type', async () => {
    const { type, met, el } = await setup();
    expect(met()).toEqual([false, false, false]);
    type('#new-password', '1234');
    expect(met()).toEqual([false, false, false]);
    type('#new-password', 'Blue-Harbour-42');
    expect(met()).toEqual([true, true, true]);
    expect(el.querySelector('.checks li')!.textContent).toContain('(met)');
  });

  it('flags a mismatched confirmation and does not submit', async () => {
    const { type, submit, el, http } = await setup();
    type('#new-password', 'Blue-Harbour-42');
    type('#confirm-password', 'Blue-Harbour-43');
    expect(el.querySelector('#confirm-error')?.textContent).toContain("The passwords don't match.");
    submit();
    http.expectNone('/api/v1/auth/password/reset');
  });

  it('submits a valid password and goes to /login?reason=reset', async () => {
    const { type, submit, http } = await setup();
    type('#new-password', 'Blue-Harbour-42');
    type('#confirm-password', 'Blue-Harbour-42');
    submit();
    const req = http.expectOne('/api/v1/auth/password/reset');
    expect(req.request.body).toEqual({ uid: 'MQ', token: 'tok-123', new_password: 'Blue-Harbour-42' });
    req.flush({ message: 'ok' });
    await new Promise((r) => setTimeout(r));
    expect(TestBed.inject(Router).url).toBe('/login?reason=reset');
  });

  it('explains an invalid link and offers a new one', async () => {
    const { type, submit, http, harness, el } = await setup();
    type('#new-password', 'Blue-Harbour-42');
    type('#confirm-password', 'Blue-Harbour-42');
    submit();
    http
      .expectOne('/api/v1/auth/password/reset')
      .flush({ error: { code: 'reset_link_invalid', message: 'x', details: {} } }, { status: 400, statusText: 'Bad' });
    harness.detectChanges();
    expect(el.textContent).toContain('This reset link is invalid or has expired.');
    expect(el.querySelector('a[href="/forgot-password"]')?.textContent).toContain('Request a new link');
  });

  it('shows server validator messages under the field', async () => {
    const { type, submit, http, harness, el } = await setup();
    type('#new-password', 'Blue-Harbour-42');
    type('#confirm-password', 'Blue-Harbour-42');
    submit();
    http.expectOne('/api/v1/auth/password/reset').flush(
      { error: { code: 'validation_error', message: 'x', details: { new_password: ['This password is too similar to the username.'] } } },
      { status: 400, statusText: 'Bad' },
    );
    harness.detectChanges();
    expect(el.querySelector('#new-password-error')?.textContent).toContain('too similar to the username');
  });
});
