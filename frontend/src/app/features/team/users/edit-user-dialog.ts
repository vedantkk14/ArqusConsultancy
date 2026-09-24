import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Observable, of, switchMap } from 'rxjs';
import { ApiError, ROLE_LABELS, Role } from '../../../core/models';
import { ROLE_HINTS } from '../../dashboard/components/account-utils';
import { TeamApi } from '../team.api';
import { TeamUser, isValidRate } from '../team.models';

export interface EditUserDialogData {
  user: TeamUser;
  /** Editing yourself: the role is fixed (you can't lock yourself out). */
  isSelf: boolean;
}

/** Edit name, email, phone and role; a commission rate appears only while the role is Sales Executive. */
@Component({
  selector: 'app-edit-user-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../dashboard/components/create-account-dialog.scss',
  template: `
    <header class="dh">
      <div>
        <h2 mat-dialog-title>Edit user</h2>
        <p>{{ data.user.username }}</p>
      </div>
      <button type="button" class="x" mat-dialog-close aria-label="Close"><mat-icon aria-hidden="true">close</mat-icon></button>
    </header>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="grid">
        <div class="field">
          <label for="eu-first">First name</label>
          <input id="eu-first" formControlName="first_name" [attr.aria-invalid]="bad('first_name') || null" />
          @if (bad('first_name')) { <p class="err">{{ msg('first_name') }}</p> }
        </div>
        <div class="field">
          <label for="eu-last">Last name</label>
          <input id="eu-last" formControlName="last_name" [attr.aria-invalid]="bad('last_name') || null" />
          @if (bad('last_name')) { <p class="err">{{ msg('last_name') }}</p> }
        </div>
        <div class="field">
          <label for="eu-email">Email</label>
          <input id="eu-email" type="email" formControlName="email" [attr.aria-invalid]="bad('email') || null" />
          @if (bad('email')) { <p class="err">{{ msg('email') }}</p> }
        </div>
        <div class="field">
          <label for="eu-phone">Phone <span class="opt">(optional)</span></label>
          <input id="eu-phone" type="tel" formControlName="phone" />
        </div>
        <div class="field">
          <label for="eu-role">Role</label>
          <select id="eu-role" formControlName="role" aria-describedby="eu-role-hint">
            @for (r of roles; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
          </select>
        </div>
        @if (isExec()) {
          <div class="field">
            <label for="eu-rate">Commission rate (%)</label>
            <input id="eu-rate" inputmode="decimal" formControlName="commission_rate" [attr.aria-invalid]="bad('commission_rate') || null" />
            @if (bad('commission_rate')) { <p class="err">{{ msg('commission_rate') }}</p> }
          </div>
        }
      </div>
      <p class="hint" id="eu-role-hint"><mat-icon aria-hidden="true">info</mat-icon>{{ data.isSelf ? "You can't change your own role." : hint() }}</p>
      @if (formError()) { <p class="err" role="alert">{{ formError() }}</p> }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save changes' }}</button>
      </div>
    </form>
  `,
})
export class EditUserDialog {
  protected readonly data = inject<EditUserDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EditUserDialog, TeamUser>);
  private readonly api = inject(TeamApi);

  protected readonly roles = Object.values(Role).map((value) => ({ value, label: ROLE_LABELS[value] }));
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly formError = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    first_name: [this.data.user.first_name, [Validators.required, Validators.maxLength(150)]],
    last_name: [this.data.user.last_name, [Validators.required, Validators.maxLength(150)]],
    email: [this.data.user.email, [Validators.required, Validators.email]],
    phone: [this.data.user.phone],
    role: [{ value: this.data.user.role, disabled: this.data.isSelf }],
    commission_rate: [this.data.user.commission_rate ?? '0.00'],
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly isExec = computed(() => (this.values().role ?? this.data.user.role) === Role.SalesExec);
  protected readonly hint = computed(() => ROLE_HINTS[(this.values().role ?? this.data.user.role) as Role]);

  protected bad(key: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[key];
    return c.invalid && (c.touched || this.submitted());
  }

  protected msg(key: keyof typeof this.form.controls): string {
    const e = this.form.controls[key].errors ?? {};
    return e['server'] ?? (e['required'] ? 'This is required.' : e['email'] ? 'Enter a valid email address.' : e['rate'] ? 'Enter 0 to 100, up to two decimals.' : 'Check this field.');
  }

  protected submit(): void {
    this.submitted.set(true);
    this.formError.set('');
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.isExec() && !isValidRate(v.commission_rate)) {
      this.form.controls.commission_rate.setErrors({ rate: true });
    }
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    const rateChanged = this.isExec() && v.commission_rate !== (this.data.user.commission_rate ?? '');
    const save$: Observable<TeamUser> = this.api
      .update(this.data.user.id, {
        first_name: v.first_name.trim(),
        last_name: v.last_name.trim(),
        email: v.email.trim(),
        phone: v.phone.trim(),
        ...(this.data.isSelf ? {} : { role: v.role as Role }),
      })
      .pipe(switchMap((user) => (rateChanged ? this.api.setCommission(user.id, v.commission_rate) : of(user))));
    save$.subscribe({
      next: (user) => this.ref.close(user),
      error: (err: ApiError) => {
        this.saving.set(false);
        let mapped = false;
        for (const [key, value] of Object.entries(err.details ?? {})) {
          const control = this.form.get(key);
          if (control && Array.isArray(value)) {
            control.setErrors({ server: String(value[0]) });
            mapped = true;
          }
        }
        if (!mapped) {
          this.formError.set(err.message);
        }
      },
    });
  }
}
