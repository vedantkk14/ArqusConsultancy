import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError, Role } from '../../../core/models';
import { ErrorState } from '../../../shared/error-state/error-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';
import { PanelHead } from '../../dashboard/components/panel-head';
import { TeamApi } from '../team.api';
import { AssignmentsOverview } from '../team.models';

/** Who is carrying how much: open leads per executive, running projects per project manager. */
@Component({
  selector: 'app-assignments-page',
  imports: [ErrorState, MatIconModule, PanelHead, RouterLink, Skeleton, UserAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assignments-page.html',
  styleUrls: ['../ui/list-kit.scss', './assignments-page.scss'],
})
export class AssignmentsPage {
  private readonly api = inject(TeamApi);
  protected readonly data = signal<AssignmentsOverview | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  private readonly auth = inject(AuthService);
  protected readonly readOnly = computed(() => this.auth.role() === Role.SalesManager);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.api.assignments().subscribe({ next: (d) => this.data.set(d), error: (e: ApiError) => this.error.set(e) });
  }
}
