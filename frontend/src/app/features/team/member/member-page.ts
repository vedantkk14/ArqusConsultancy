import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError, Role } from '../../../core/models';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { RoleBadge } from '../../../shared/role-badge/role-badge';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';
import { PanelHead } from '../../dashboard/components/panel-head';
import { relativeTime } from '../../dashboard/dashboard-utils';
import { TeamApi } from '../team.api';
import { DELIVERY_LABELS, MemberPerformance } from '../team.models';

/** One person: contact details, and how they are doing on leads and/or projects. */
@Component({
  selector: 'app-member-page',
  imports: [DatePipe, ErrorState, InrPipe, MatButtonModule, MatIconModule, PanelHead, RoleBadge, RouterLink, Skeleton, UserAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './member-page.html',
  styleUrls: ['../ui/list-kit.scss', './member-page.scss'],
})
export class MemberPage {
  private readonly api = inject(TeamApi);
  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => Number(p.get('id')))), { initialValue: 0 });
  protected readonly data = signal<MemberPerformance | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  private readonly auth = inject(AuthService);
  protected readonly backTo = computed(() => (this.auth.role() === Role.Admin ? '/team/users' : '/team/assignments'));
  protected readonly delivery = DELIVERY_LABELS;
  protected readonly ago = relativeTime;
  /** Won vs lost as bar widths (geometry only). */
  protected readonly split = computed(() => {
    const l = this.data()?.leads;
    const total = l ? l.won + l.lost : 0;
    return total ? Math.round(((l?.won ?? 0) / total) * 100) : 0;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.data.set(null);
    this.api.performance(this.id()).subscribe({ next: (d) => this.data.set(d), error: (e: ApiError) => this.error.set(e) });
  }
}
