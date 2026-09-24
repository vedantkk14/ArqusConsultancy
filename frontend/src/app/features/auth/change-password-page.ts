import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { safeReturnUrl } from '../../core/auth/safe-return-url';
import { ApiError } from '../../core/models';
import { authErrorMessage, fieldError } from './auth-messages';
import { AuthLayout } from './auth-layout';
import { PasswordChecklist } from './password-checklist';
import { PasswordField } from './password-field';
import { matchValidator, strongPassword } from './password-rules';

type Field = 'current' | 'password' | 'confirm';

@Component({
  selector: 'app-change-password-page',
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
  templateUrl: './change-password-page.html',
})
export class ChangePasswordPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  /** Forced: a temporary password must be replaced before anything else (no cancel, no way back). */
  protected readonly forced = computed(() => this.auth.mustChangePassword() || this.query.get('forced') === 'true');
  private readonly forcedAtStart = this.forced();

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      current: ['', Validators.required],
      password: ['', [Validators.required, strongPassword]],
      confirm: ['', Validators.required],
    },
    { validators: matchValidator('password', 'confirm') },
  );
  protected readonly password = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected readonly submitted = signal(false);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Partial<Record<Field, string>>>({});
  private readonly fields = viewChildren(PasswordField);

  constructor() {
    this.form.valueChanges.subscribe(() => {
      if (Object.keys(this.serverErrors()).length) {
        this.serverErrors.set({});
      }
    });
  }

  protected cancelUrl(): string {
    return safeReturnUrl(this.query.get('returnUrl')) ?? this.auth.homeRoute();
  }

  protected show(field: Field): boolean {
    if (this.serverErrors()[field]) {
      return true;
    }
    const c = this.form.controls[field];
    const touched = c.touched || this.submitted();
    if (field === 'confirm') {
      return touched && (c.invalid || this.form.hasError('mismatch'));
    }
    return touched && c.invalid;
  }

  protected submit(): void {
    if (this.pending()) {
      return;
    }
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focus(this.form.controls.current.invalid ? 0 : this.form.controls.password.invalid ? 1 : 2);
      return;
    }
    const { current, password } = this.form.getRawValue();
    this.pending.set(true);
    this.error.set(null);
    this.auth.changePassword(current, password).subscribe({
      next: () => {
        this.snackBar.open('Password updated', undefined, { duration: 4000 });
        void this.router.navigateByUrl(this.forcedAtStart ? this.auth.homeRoute() : this.cancelUrl());
      },
      error: (err: ApiError) => {
        this.pending.set(false);
        const current = fieldError(err, 'old_password');
        const next = fieldError(err, 'new_password');
        if (current || next) {
          this.serverErrors.set({ ...(current ? { current } : {}), ...(next ? { password: next } : {}) });
          this.focus(current ? 0 : 1);
        } else {
          this.error.set(authErrorMessage(err));
        }
      },
    });
  }

  private focus(index: number): void {
    queueMicrotask(() => this.fields()[index]?.focus());
  }
}
