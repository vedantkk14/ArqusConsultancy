import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models';
import { authErrorMessage, retryAfter } from './auth-messages';
import { AuthLayout } from './auth-layout';
import { Countdown } from './countdown';
import { PasswordField } from './password-field';

const REASONS: Record<string, string> = {
  expired: 'Your session expired. Please sign in again.',
  reset: 'Password updated. Sign in with your new password.',
};

@Component({
  selector: 'app-login-page',
  imports: [
    AuthLayout,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PasswordField,
    ReactiveFormsModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
  styleUrl: './auth-form.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required],
    remember: [false],
  });

  protected readonly submitted = signal(false);
  protected readonly pending = signal(false);
  private readonly error = signal<ApiError | null>(null);
  protected readonly lock = new Countdown(() => {
    this.error.set(null);
    this.form.enable();
  });

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly notice = computed(() => (this.error() ? null : REASONS[this.params().get('reason') ?? ''] ?? null));
  protected readonly errorText = computed(() => {
    const err = this.error();
    if (!err) {
      return null;
    }
    const base = authErrorMessage(err);
    return this.lock.running() ? `${base} Try again in ${this.lock.label()}.` : base;
  });

  private readonly identifierInput = viewChild.required<ElementRef<HTMLInputElement>>('identifier');
  private readonly passwordField = viewChild.required(PasswordField);

  constructor() {
    // Autofocus on desktop only: on phones it would pop the keyboard over the page.
    afterNextRender(() => {
      if (window.matchMedia?.('(pointer: fine)').matches) {
        this.identifierInput().nativeElement.focus();
      }
    });
  }

  protected showError(name: 'identifier' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected submit(): void {
    if (this.pending() || this.lock.running()) {
      return; // double submit, or still locked
    }
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }
    const { identifier, password, remember } = this.form.getRawValue();
    this.pending.set(true);
    this.error.set(null);
    this.auth.login(identifier.trim(), password, remember).subscribe({
      next: () => void this.router.navigateByUrl(this.auth.afterLoginUrl(this.params().get('returnUrl'))),
      error: (err: ApiError) => this.fail(err),
    });
  }

  private fail(err: ApiError): void {
    this.pending.set(false);
    this.error.set(err ?? { status: 0, code: 'error', message: '', details: {} });
    const wait = retryAfter(err);
    if (wait) {
      this.form.disable();
      this.lock.start(wait);
    } else if (err?.code === 'invalid_credentials') {
      this.form.controls.password.reset('');
      queueMicrotask(() => this.passwordField().focus());
    }
  }

  private focusFirstInvalid(): void {
    if (this.form.controls.identifier.invalid) {
      this.identifierInput().nativeElement.focus();
    } else {
      this.passwordField().focus();
    }
  }
}
