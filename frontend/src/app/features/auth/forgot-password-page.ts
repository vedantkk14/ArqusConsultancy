import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models';
import { authErrorMessage, fieldError, retryAfter } from './auth-messages';
import { AuthLayout } from './auth-layout';
import { Countdown } from './countdown';

export const FORGOT_CONFIRMATION = "If that email is registered, we've sent a 6-digit code.";
const RESEND_COOLDOWN_SECONDS = 120;

/** Forgot password in two steps: the email, then the 6-digit code that was emailed. */
@Component({
  selector: 'app-forgot-password-page',
  imports: [AuthLayout, MatButtonModule, MatIconModule, MatProgressSpinnerModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.scss',
  styles: `
    .code-input {
      text-align: center; font-size: 28px; font-weight: 700; letter-spacing: 0.5em;
      padding-left: 0.5em; font-variant-numeric: tabular-nums;
    }
    .linklike { background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }
  `,
  template: `
    <app-auth-layout>
      <h1>{{ step() === 'email' ? 'Forgot password' : 'Enter your code' }}</h1>
      @if (step() === 'email') {
        <p class="lede">Enter the email on your account and we'll send you a 6-digit code to set a new password.</p>
      } @else {
        <p class="lede">Type the 6-digit code we emailed to {{ sentTo() }}. It expires in 10 minutes.</p>
      }

      @if (step() === 'email') {
        <form [formGroup]="form" (ngSubmit)="sendCode()" novalidate>
          @if (error(); as text) {
            <p class="banner error" role="alert">
              <mat-icon aria-hidden="true">error_outline</mat-icon><span>{{ text }}</span>
            </p>
          }

          <div class="field">
            <label for="email">Email</label>
            <input
              #email
              id="email"
              type="email"
              formControlName="email"
              autocomplete="email"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              inputmode="email"
              enterkeyhint="send"
              [attr.aria-invalid]="showError()"
              [attr.aria-describedby]="showError() ? 'email-error' : null"
            />
            @if (showError()) {
              <p id="email-error" class="field-error" aria-live="polite">Enter a valid email address.</p>
            }
          </div>

          <button matButton="filled" type="submit" class="submit" [disabled]="pending() || cooldown.running()">
            @if (pending()) {
              <mat-spinner diameter="18" aria-hidden="true" />
              Sending…
            } @else if (cooldown.running()) {
              Try again in {{ cooldown.label() }}
            } @else {
              Send code
            }
          </button>

          <p class="center"><a class="link" routerLink="/login">Back to sign in</a></p>
        </form>
      } @else {
        <form [formGroup]="codeForm" (ngSubmit)="verify()" novalidate>
          <p class="banner success" role="status">
            <mat-icon aria-hidden="true">mark_email_read</mat-icon><span>{{ confirmation }}</span>
          </p>
          @if (error(); as text) {
            <p class="banner error" role="alert">
              <mat-icon aria-hidden="true">error_outline</mat-icon><span>{{ text }}</span>
            </p>
          }

          <div class="field">
            <label for="otp">6-digit code</label>
            <input
              #otp
              id="otp"
              class="code-input"
              type="text"
              formControlName="otp"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="······"
              enterkeyhint="done"
              [attr.aria-invalid]="showCodeError()"
              [attr.aria-describedby]="showCodeError() ? 'otp-error' : null"
              (input)="onCodeInput($event)"
            />
            @if (showCodeError()) {
              <p id="otp-error" class="field-error" aria-live="polite">Enter the 6-digit code from the email.</p>
            }
          </div>

          <button matButton="filled" type="submit" class="submit" [disabled]="pending()">
            @if (pending()) {
              <mat-spinner diameter="18" aria-hidden="true" />
              Checking…
            } @else {
              Verify code
            }
          </button>

          <p class="center">
            <button type="button" class="link linklike" [disabled]="pending() || cooldown.running()" (click)="resend()">
              {{ cooldown.running() ? 'Resend code in ' + cooldown.label() : 'Resend code' }}
            </button>
          </p>
          <p class="center"><a class="link" routerLink="/login">Back to sign in</a></p>
        </form>
      }
    </app-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly confirmation = FORGOT_CONFIRMATION;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly codeForm = inject(FormBuilder).nonNullable.group({
    otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  protected readonly step = signal<'email' | 'code'>('email');
  protected readonly sentTo = signal('');
  protected readonly submitted = signal(false);
  protected readonly codeSubmitted = signal(false);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cooldown = new Countdown(() => this.error.set(null));
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('email');
  private readonly otpInput = viewChild<ElementRef<HTMLInputElement>>('otp');

  protected showError(): boolean {
    const c = this.form.controls.email;
    return c.invalid && (c.touched || this.submitted());
  }

  protected showCodeError(): boolean {
    const c = this.codeForm.controls.otp;
    return c.invalid && (c.touched || this.codeSubmitted());
  }

  /** Digits only, so a pasted "123 456" still works. */
  protected onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== input.value) {
      input.value = digits;
      this.codeForm.controls.otp.setValue(digits);
    }
  }

  protected sendCode(): void {
    if (this.pending() || this.cooldown.running()) {
      return;
    }
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.emailInput()?.nativeElement.focus();
      return;
    }
    this.request(() => {
      this.sentTo.set(this.form.getRawValue().email.trim());
      this.step.set('code');
      setTimeout(() => this.otpInput()?.nativeElement.focus());
    });
  }

  protected resend(): void {
    if (this.pending() || this.cooldown.running()) {
      return;
    }
    this.codeForm.reset();
    this.request(() => undefined);
  }

  private request(done: () => void): void {
    this.pending.set(true);
    this.error.set(null);
    this.auth.forgotPassword(this.form.getRawValue().email.trim()).subscribe({
      next: () => {
        this.pending.set(false);
        this.cooldown.start(RESEND_COOLDOWN_SECONDS);
        done();
      },
      error: (err: ApiError) => {
        this.pending.set(false);
        const wait = retryAfter(err);
        this.error.set(wait ? `${authErrorMessage(err)} Please wait before trying again.` : authErrorMessage(err));
        if (wait) {
          this.cooldown.start(wait);
        }
      },
    });
  }

  protected verify(): void {
    if (this.pending()) {
      return;
    }
    this.codeSubmitted.set(true);
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      this.otpInput()?.nativeElement.focus();
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    this.auth.verifyPasswordOtp(this.sentTo(), this.codeForm.getRawValue().otp).subscribe({
      next: ({ uid, token }) => void this.router.navigate(['/reset-password', uid, token]),
      error: (err: ApiError) => {
        this.pending.set(false);
        const wait = retryAfter(err);
        this.error.set(
          fieldError(err, 'otp') ?? (wait ? `${authErrorMessage(err)} Please wait before trying again.` : authErrorMessage(err)),
        );
        this.otpInput()?.nativeElement.select();
      },
    });
  }
}
