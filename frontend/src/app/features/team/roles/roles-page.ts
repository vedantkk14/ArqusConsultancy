import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ApiError } from '../../../core/models';
import { ErrorState } from '../../../shared/error-state/error-state';
import { RoleBadge } from '../../../shared/role-badge/role-badge';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { TeamApi } from '../team.api';
import { RoleReference } from '../team.models';

/** The four fixed roles and what each can do. Read-only: roles are defined by the product, not edited here. */
@Component({
  selector: 'app-roles-page',
  imports: [ErrorState, MatIconModule, RoleBadge, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './roles-page.html',
  styleUrls: ['../ui/list-kit.scss', './roles-page.scss'],
})
export class RolesPage {
  private readonly api = inject(TeamApi);
  protected readonly roles = signal<RoleReference[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.api.roles().subscribe({ next: (r) => this.roles.set(r), error: (e: ApiError) => this.error.set(e) });
  }
}
