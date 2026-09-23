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
          <p class="role"><span class="label">Role</span> {{ roleLabels[user.role] }}</p>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    h1 {
      font-size: 1.5rem;
      line-height: 1.2;
      margin: 0 0 var(--space-3);
    }
    .greeting {
      font-size: 1.25rem;
      font-weight: 600;
      margin: var(--space-2) 0 var(--space-1);
    }
    .role {
      margin: 0 0 var(--space-2);
      color: var(--ink-2);
    }
    .label {
      margin-right: var(--space-1);
    }
  `,
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  protected readonly roleLabels = ROLE_LABELS;
}
