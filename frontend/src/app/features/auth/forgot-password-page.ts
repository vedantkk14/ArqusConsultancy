import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models';
import { authErrorMessage, retryAfter } from './auth-messages';
import { AuthLayout } from './auth-layout';
import { Countdown } from './countdown';

export const FORGOT_CONFIRMATION = "If that email is registered, we've sent a reset link.";
const RESEND_COOLDOWN_SECONDS = 30;

@Component({
  selector: 'app-forgot-password-page',
  imports: [AuthLayout, MatButtonModule, MatIconModule, MatProgressSpinnerModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.scss',
  template: `
    <app-auth-layout>
      <h1>Forgot password</h1>
      <p class="lede">Enter the email on your account and we'll send you a link to set a new password.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (sent()) {
          <p class="banner success" role="status">
            <mat-icon aria-hidden="true">mark_email_read</mat-icon><span>{{ confirmation }}</span>
          </p>
        }
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
            Resend in {{ cooldown.label() }}
          } @else {
            {{ sent() ? 'Resend link' : 'Send reset link' }}
          }
        </button>

        <p class="center"><a class="link" routerLink="/login">Back to sign in</a></p>
      </form>
    </app-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly confirmation = FORGOT_CONFIRMATION;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly submitted = signal(false);
  protected readonly pending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cooldown = new Countdown(() => this.error.set(null));
  private readonly emailInput = viewChild.required<ElementRef<HTMLInputElement>>('email');

  protected showError(): boolean {
    const c = this.form.controls.email;
    return c.invalid && (c.touched || this.submitted());
  }

  protected submit(): void {
    if (this.pending() || this.cooldown.running()) {
      return;
    }
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.emailInput().nativeElement.focus();
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    this.auth.forgotPassword(this.form.getRawValue().email.trim()).subscribe({
      next: () => {
        this.pending.set(false);
        this.sent.set(true);
        this.cooldown.start(RESEND_COOLDOWN_SECONDS);
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
}
