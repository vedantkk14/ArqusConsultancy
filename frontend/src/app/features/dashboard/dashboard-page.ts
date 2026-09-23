import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/models';

/** Placeholder dashboard. Dev C replaces the body with GET /api/v1/dashboard/admin data. */
@Component({
  selector: 'app-dashboard-page',
  imports: [MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Dashboard</h1>
    @if (auth.user(); as user) {
      <mat-card appearance="outlined">
        <mat-card-content>
          <p class="greeting">Welcome, {{ user.name }}</p>
          <p class="role">Role: {{ roleLabels[user.role] }}</p>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 0 0 var(--space-3);
    }
    .greeting {
      font: var(--mat-sys-title-large);
      margin: var(--space-2) 0 var(--space-1);
    }
    .role {
      margin: 0 0 var(--space-2);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  protected readonly roleLabels = ROLE_LABELS;
}
