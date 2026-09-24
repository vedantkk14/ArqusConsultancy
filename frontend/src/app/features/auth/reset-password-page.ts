import { ChangeDetectionStrategy, Component, inject, signal, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models';
import { AUTH_MESSAGES, authErrorMessage, fieldError } from './auth-messages';
import { AuthLayout } from './auth-layout';
import { PasswordChecklist } from './password-checklist';
import { PasswordField } from './password-field';
import { matchValidator, strongPassword } from './password-rules';

@Component({
  selector: 'app-reset-password-page',
  imports: [
    AuthLayout,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PasswordChecklist,
    PasswordField,
    ReactiveFormsModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-form.scss',
  template: `
    <app-auth-layout>
      <h1>Set a new password</h1>
      @if (linkInvalid()) {
        <p class="banner error" role="alert">
          <mat-icon aria-hidden="true">link_off</mat-icon>
          <span>{{ messages.reset_link_invalid }} Reset links work once and expire after an hour.</span>
        </p>
        <p class="center"><a class="link" routerLink="/forgot-password">Request a new link</a></p>
      } @else {
        <p class="lede">Choose a password you don't use anywhere else.</p>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error(); as text) {
            <p class="banner error" role="alert">
              <mat-icon aria-hidden="true">error_outline</mat-icon><span>{{ text }}</span>
            </p>
          }
          <app-password-field
            inputId="new-password"
            label="New password"
            autocomplete="new-password"
            enterKeyHint="next"
            errorId="new-password-error"
            [control]="form.controls.password"
            [invalid]="showPasswordError()"
          >
            <app-password-checklist fieldError listId="new-password-rules" [value]="password()" />
            @if (serverError(); as text) {
              <p fieldError id="new-password-error" class="field-error" aria-live="polite">{{ text }}</p>
            } @else if (showPasswordError()) {
              <p fieldError id="new-password-error" class="field-error" aria-live="polite">
                Your password doesn't meet the requirements yet.
              </p>
            }
          </app-password-field>

          <app-password-field
            inputId="confirm-password"
            label="Confirm password"
            autocomplete="new-password"
            enterKeyHint="done"
            errorId="confirm-error"
            [control]="form.controls.confirm"
            [invalid]="showMismatch()"
          >
            @if (showMismatch()) {
              <p fieldError id="confirm-error" class="field-error" aria-live="polite">The passwords don't match.</p>
            }
          </app-password-field>

          <button matButton="filled" type="submit" class="submit" [disabled]="pending()">
            @if (pending()) {
              <mat-spinner diameter="18" aria-hidden="true" />
              Saving…
            } @else {
              Set new password
            }
          </button>
          <p class="center"><a class="link" routerLink="/login">Back to sign in</a></p>
        </form>
      }
    </app-auth-layout>
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly messages = AUTH_MESSAGES;
  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      password: ['', [Validators.required, strongPassword]],
      confirm: ['', Validators.required],
    },
    { validators: matchValidator('password', 'confirm') },
  );
  protected readonly password = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected readonly submitted = signal(false);
  protected readonly pending = signal(false);
  protected readonly linkInvalid = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverError = signal<string | null>(null);
  private readonly fields = viewChildren(PasswordField);

  constructor() {
    this.form.controls.password.valueChanges.subscribe(() => this.serverError.set(null));
  }

  protected showPasswordError(): boolean {
    const c = this.form.controls.password;
    return !!this.serverError() || (c.invalid && (c.touched || this.submitted()));
  }

  protected showMismatch(): boolean {
    const c = this.form.controls.confirm;
    const touched = c.touched || this.submitted();
    return touched && (c.hasError('required') || this.form.hasError('mismatch'));
  }

  protected submit(): void {
    if (this.pending()) {
      return;
    }
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.fields()[this.form.controls.password.invalid ? 0 : 1]?.focus();
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    const uid = this.params.get('uid') ?? '';
    const token = this.params.get('token') ?? '';
    this.auth.resetPassword(uid, token, this.form.getRawValue().password).subscribe({
      next: () => void this.router.navigate(['/login'], { queryParams: { reason: 'reset' } }),
      error: (err: ApiError) => {
        this.pending.set(false);
        if (err?.code === 'reset_link_invalid') {
          this.linkInvalid.set(true);
        } else if (fieldError(err, 'new_password')) {
          this.serverError.set(fieldError(err, 'new_password'));
          this.fields()[0]?.focus();
        } else {
          this.error.set(authErrorMessage(err));
        }
      },
    });
  }
}
