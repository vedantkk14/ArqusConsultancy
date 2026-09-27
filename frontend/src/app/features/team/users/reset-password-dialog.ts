import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ApiError } from '../../../core/models';
import { TeamApi } from '../team.api';
import { TeamUser } from '../team.models';

/** Confirm, then show the new temporary password once (with Copy). It is not emailed and cannot be read again. */
@Component({
  selector: 'app-reset-password-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../dashboard/components/create-account-dialog.scss',
  template: `
    <header class="dh">
      <div>
        <h2 mat-dialog-title>{{ password() ? 'New temporary password' : 'Reset password?' }}</h2>
        <p>{{ data.user.name }}</p>
      </div>
      <button type="button" class="x" mat-dialog-close aria-label="Close"><mat-icon aria-hidden="true">close</mat-icon></button>
    </header>

    @if (password(); as pw) {
      <dl class="details">
        <dt>Username</dt><dd>{{ data.user.username }}</dd>
        <dt>Temporary password</dt><dd class="mono" data-testid="temp-password">{{ pw }}</dd>
      </dl>
      <p class="hint warn"><mat-icon aria-hidden="true">warning</mat-icon>Copy it now: it won't be shown again. They must choose their own password when they sign in.</p>
      <div class="actions">
        <button matButton="outlined" type="button" (click)="copy()"><mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>{{ copied() ? 'Copied' : 'Copy password' }}</button>
        <button matButton="filled" type="button" mat-dialog-close>Done</button>
      </div>
    } @else {
      <p class="note">
        This signs {{ data.user.name }} out everywhere and gives them a new temporary password. Their current
        password stops working.
      </p>
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="button" [disabled]="working()" (click)="reset()">{{ working() ? 'Resetting…' : 'Reset password' }}</button>
      </div>
    }
  `,
})
export class ResetPasswordDialog {
  protected readonly data = inject<{ user: TeamUser }>(MAT_DIALOG_DATA);
  private readonly api = inject(TeamApi);

  protected readonly password = signal('');
  protected readonly working = signal(false);
  protected readonly error = signal('');
  protected readonly copied = signal(false);

  protected reset(): void {
    this.working.set(true);
    this.api.resetPassword(this.data.user.id).subscribe({
      next: (res) => {
        this.password.set(res.temporary_password);
        this.working.set(false);
      },
      error: (err: ApiError) => {
        this.working.set(false);
        this.error.set(err.message);
      },
    });
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.password());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      /* clipboard unavailable: the password is on screen */
    }
  }
}
