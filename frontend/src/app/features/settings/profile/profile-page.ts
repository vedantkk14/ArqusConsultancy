import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError, ROLE_LABELS, Role } from '../../../core/models';
import { ErrorState } from '../../../shared/error-state/error-state';
import { RoleBadge } from '../../../shared/role-badge/role-badge';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';
import { SettingsApi } from '../settings.api';
import { Profile } from '../settings.models';

/** Any signed-in user: edit your own name and phone. Email, role and commission are shown, not editable. */
@Component({
  selector: 'app-profile-page',
  imports: [DatePipe, ErrorState, MatButtonModule, MatIconModule, ReactiveFormsModule, RoleBadge, RouterLink, Skeleton, UserAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly api = inject(SettingsApi);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);

  protected readonly profile = signal<Profile | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    first_name: ['', [Validators.required, Validators.maxLength(150)]],
    last_name: ['', Validators.maxLength(150)],
    phone: ['', Validators.maxLength(20)],
  });

  constructor() {
    this.load();
  }

  protected asRole(role: string): Role {
    return role as Role;
  }

  protected load(): void {
    this.error.set(null);
    this.api.profile().subscribe({ next: (p) => this.fill(p), error: (e: ApiError) => this.error.set(e) });
  }

  protected save(): void {
    this.formError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.api.saveProfile({ first_name: v.first_name.trim(), last_name: v.last_name.trim(), phone: v.phone.trim() }).subscribe({
      next: (p) => {
        this.saving.set(false);
        this.fill(p);
        this.auth.updateUser({ name: p.name });
        this.snack.open('Profile updated.', undefined, { duration: 3000 });
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.formError.set(err.message);
      },
    });
  }

  protected invalid(key: 'first_name' | 'last_name' | 'phone'): boolean {
    const c = this.form.controls[key];
    return c.invalid && c.touched;
  }

  protected reset(): void {
    const p = this.profile();
    if (p) {
      this.fill(p);
    }
  }

  private fill(p: Profile): void {
    this.profile.set(p);
    this.form.reset({ first_name: p.first_name, last_name: p.last_name, phone: p.phone });
  }
}
