import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ForgotPasswordPage } from './forgot-password-page';

function setup(verify = () => of({ uid: 'MQ', token: 'abc-123' })) {
  const auth = {
    forgotPassword: vi.fn(() => of({ message: 'ok' })),
    verifyPasswordOtp: vi.fn(verify),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ForgotPasswordPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const type = (id: string, value: string) => {
    const input = el.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  return { fixture, el, auth, navigate, type, submit };
}

describe('ForgotPasswordPage (6-digit code)', () => {
  it('asks for the email first, then shows the code step after sending', () => {
    const { el, auth, type, submit } = setup();
    expect(el.textContent).toContain('Send code');
    type('email', 'pat@example.com');
    submit();
    expect(auth.forgotPassword).toHaveBeenCalledWith('pat@example.com');
    expect(el.textContent).toContain('Enter your code');
    expect(el.textContent).toContain('pat@example.com');
    expect(el.querySelector('#otp')).toBeTruthy();
  });

  it('does not send for an invalid email', () => {
    const { auth, type, submit } = setup();
    type('email', 'nope');
    submit();
    expect(auth.forgotPassword).not.toHaveBeenCalled();
  });

  it('verifies the code and continues to the new-password page', () => {
    const { auth, navigate, type, submit } = setup();
    type('email', 'pat@example.com');
    submit();
    type('otp', '123456');
    submit();
    expect(auth.verifyPasswordOtp).toHaveBeenCalledWith('pat@example.com', '123456');
    expect(navigate).toHaveBeenCalledWith(['/reset-password', 'MQ', 'abc-123']);
  });

  it('keeps only digits and rejects a short code without calling the server', () => {
    const { el, auth, type, submit } = setup();
    type('email', 'pat@example.com');
    submit();
    type('otp', '12 34');
    expect((el.querySelector('#otp') as HTMLInputElement).value).toBe('1234');
    submit();
    expect(auth.verifyPasswordOtp).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Enter the 6-digit code');
  });

  it('shows a wrong-code message and stays on the code step', () => {
    const wrong = () => throwError(() => ({ code: 'otp_invalid', message: 'x', details: {} }));
    const { el, navigate, type, submit } = setup(wrong);
    type('email', 'pat@example.com');
    submit();
    type('otp', '000000');
    submit();
    expect(el.textContent).toContain('incorrect or has expired');
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('#otp')).toBeTruthy();
  });

  it('makes the user wait 2 minutes before a new code can be requested', () => {
    const { el, type, submit } = setup();
    type('email', 'pat@example.com');
    submit();
    expect(el.textContent).toContain('Resend code in 2:00');
    expect(el.textContent).not.toContain('different email');
  });
});
