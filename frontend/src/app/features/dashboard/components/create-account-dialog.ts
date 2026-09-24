import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/api/api.service';
import { ApiError, ROLE_LABELS, Role } from '../../../core/models';
import { ROLE_HINTS, generatePassword, suggestUsername } from './account-utils';

export interface CreatedAccount {
  id: number;
  name: string;
  email: string;
  role: Role;
  must_change_password: boolean;
}

const FIELDS = ['first_name', 'last_name', 'email', 'phone', 'username', 'role', 'password'] as const;

/** Admin creates a login for any role. Ends on a "created" view with the sign-in details to hand over. */
@Component({
  selector: 'app-create-account-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-account-dialog.html',
  styleUrl: './create-account-dialog.scss',
})
export class CreateAccountDialog {
  private readonly api = inject(ApiService);
  private readonly ref = inject(MatDialogRef<CreateAccountDialog, CreatedAccount>);

  protected readonly roles = Object.values(Role).map((value) => ({ value, label: ROLE_LABELS[value] }));
  protected readonly hints = ROLE_HINTS;
  protected readonly labels = ROLE_LABELS;
  protected readonly showPassword = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly submitted = signal(false);
  protected readonly created = signal<CreatedAccount | null>(null);
  protected readonly copied = signal(false);
  private usernameEdited = false;
  private lastPassword = '';

  protected readonly form = inject(FormBuilder).nonNullable.group({
    first_name: ['', [Validators.required, Validators.maxLength(150)]],
    last_name: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.maxLength(20)],
    username: ['', [Validators.required, Validators.pattern(/^[\w.@+-]+$/), Validators.maxLength(150)]],
    role: ['' as Role | '', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    must_change_password: [true],
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly roleHint = computed(() => {
    const role = this.values().role as Role | '';
    return role ? this.hints[role] : 'Choose what this person can do.';
  });

  protected show(key: (typeof FIELDS)[number]): boolean {
    const control = this.form.controls[key];
    return control.invalid && (control.touched || this.submitted());
  }

  protected message(key: (typeof FIELDS)[number]): string {
    const e = this.form.controls[key].errors ?? {};
    if (e['server']) return e['server'];
    if (e['required']) return key === 'role' ? 'Choose a role.' : 'This is required.';
    if (e['email']) return 'Enter a valid email address.';
    if (e['pattern']) return 'Use letters, numbers and . _ - @ + only.';
    if (e['minlength']) return 'Use at least 8 characters.';
    return 'Check this field.';
  }

  /** The sign-in name follows the email until the admin types their own. */
  protected onEmail(): void {
    if (!this.usernameEdited) {
      this.form.controls.username.setValue(suggestUsername(this.form.controls.email.value));
    }
  }

  protected onUsername(): void {
    this.usernameEdited = true;
  }

  protected generate(): void {
    const password = generatePassword();
    this.form.controls.password.setValue(password);
    this.form.controls.password.markAsDirty();
    this.showPassword.set(true);
  }

  protected submit(): void {
    this.submitted.set(true);
    this.formError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.focusFirstInvalid();
      return;
    }
    const v = this.form.getRawValue();
    this.lastPassword = v.password;
    this.saving.set(true);
    this.api.post<CreatedAccount>('/users', { ...v, first_name: v.first_name.trim(), last_name: v.last_name.trim() }).subscribe({
      next: (user) => {
        this.saving.set(false);
        this.created.set(user);
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.applyServerErrors(err);
      },
    });
  }

  protected signInDetails(): string {
    const user = this.created();
    const username = this.form.controls.username.value;
    return user ? `ARQUS sign-in\nName: ${user.name}\nUsername: ${username}\nEmail: ${user.email}\nPassword: ${this.lastPassword}` : '';
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.signInDetails());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      /* clipboard unavailable: the details are on screen */
    }
  }

  protected another(): void {
    this.created.set(null);
    this.submitted.set(false);
    this.usernameEdited = false;
    this.showPassword.set(false);
    this.form.reset({ must_change_password: true });
  }

  protected done(): void {
    this.ref.close(this.created() ?? undefined);
  }

  private applyServerErrors(err: ApiError): void {
    let mapped = false;
    for (const [key, value] of Object.entries(err.details ?? {})) {
      const control = this.form.get(key);
      if (control && Array.isArray(value)) {
        control.setErrors({ server: String(value[0]) });
        control.markAsTouched();
        mapped = true;
      }
    }
    if (!mapped) {
      this.formError.set(err.status === 403 ? 'Only an admin can create accounts.' : err.message);
    }
    this.focusFirstInvalid();
  }

  private focusFirstInvalid(): void {
    const key = FIELDS.find((k) => this.form.controls[k].invalid);
    if (key) {
      queueMicrotask(() => document.getElementById(`ca-${key}`)?.focus());
    }
  }
}
