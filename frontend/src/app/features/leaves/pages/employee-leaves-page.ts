import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { RoleBadge } from '../../../shared/role-badge/role-badge';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';
import { PanelHead } from '../../dashboard/components/panel-head';
import { DecideDialog, DecideDialogData } from '../components/decide-dialog';
import { LeaveRequestItem, LeaveStatus, LeaveSummary } from '../data/leave.models';
import { LeavesApi } from '../data/leaves-api.service';

const STATUS_TINT: Record<LeaveStatus, string> = {
  PENDING: 't-amber',
  APPROVED: 't-teal',
  REJECTED: 't-slate',
};

@Component({
  selector: 'app-employee-leaves-page',
  imports: [
    CommonModule,
    EmptyState,
    MatButtonModule,
    MatIconModule,
    PanelHead,
    RoleBadge,
    RouterLink,
    Skeleton,
    UserAvatar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      align-self: flex-start;
      color: var(--brand-deep);
      font-size: var(--text-sm);
      font-weight: 500;
      text-decoration: none;
      padding: 4px 8px;
      border-radius: var(--radius-control);
      transition: background 0.15s ease;
    }
    .back:hover {
      background: var(--subtle);
    }
    .back mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }

    .card {
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
      background: var(--surface);
      box-shadow: var(--highlight), var(--shadow-1);
    }
    .card.no-pad {
      padding: 0;
    }

    /* Employee Profile Header */
    .profile-card {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-5);
    }
    .profile-info {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 200px;
    }
    .profile-info h1 {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: 700;
      color: var(--ink);
    }
    .profile-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* KPI Summary Tiles */
    .tiles {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }
    @media (min-width: 768px) {
      .tiles {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: var(--space-4);
      border-radius: var(--radius-card);
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: var(--highlight), var(--shadow-1);
    }
    .tile .k {
      color: var(--ink-3);
      font-size: var(--text-xs);
      font-weight: 500;
    }
    .tile .v {
      color: var(--ink);
      font-size: var(--text-xl);
      font-weight: 700;
      line-height: 1.2;
    }
    .tile .v small {
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--ink-2);
    }
    .tile .s {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .tile.highlight {
      background: var(--wash);
      border-color: var(--brand-deep);
    }
    .tile.highlight .v {
      color: var(--brand-deep);
    }

    /* Leave History List */
    .ph {
      padding: var(--space-4);
      border-bottom: 1px solid var(--line);
    }
    ul.reqs {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    ul.reqs li {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: var(--space-4);
      border-bottom: 1px solid var(--line);
      transition: background 0.15s ease;
    }
    ul.reqs li:last-child {
      border-bottom: 0;
    }
    ul.reqs li:hover {
      background: var(--subtle);
    }

    .req-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .dates-line {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--ink);
    }
    .cal-ic {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--ink-3);
    }
    .reason {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--ink-2);
    }
    .note {
      margin: 2px 0 0;
      font-size: var(--text-xs);
      color: var(--ink-3);
      background: var(--wash);
      padding: 4px 8px;
      border-radius: var(--radius-control);
      display: inline-block;
    }
    .applied-at {
      margin: 2px 0 0;
      font-size: var(--text-xs);
      color: var(--ink-3);
    }

    .chip {
      padding: 3px 12px;
      border-radius: var(--radius-pill);
      font-size: var(--text-xs);
      font-weight: 600;
      white-space: nowrap;
    }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-slate { background: var(--tint-slate); color: var(--tint-slate-ink); }

    .req-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
    }
  `,
  template: `
    <a class="back" routerLink="/leaves">
      <mat-icon aria-hidden="true">arrow_back</mat-icon>
      Back to leaves
    </a>

    @if (loading()) {
      <div class="card profile-card">
        <app-skeleton width="52px" height="52px" radius="50%" />
        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
          <app-skeleton width="180px" height="24px" />
          <app-skeleton width="120px" height="18px" />
        </div>
      </div>
      <div class="tiles">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="tile">
            <app-skeleton width="60%" height="14px" />
            <app-skeleton width="40%" height="28px" radius="6px" />
            <app-skeleton width="80%" height="12px" />
          </div>
        }
      </div>
    } @else {
      <!-- Profile Header -->
      <section class="card profile-card">
        <app-user-avatar [name]="employeeName()" [size]="52" />
        <div class="profile-info">
          <h1>{{ employeeName() }}</h1>
          <div class="profile-meta">
            @if (employeeRole()) {
              <app-role-badge [role]="employeeRole()!" />
            }
          </div>
        </div>
      </section>

      <!-- KPI Summary Cards -->
      <div class="tiles">
        <div class="tile highlight">
          <span class="k">Leaves this month</span>
          <span class="v num">{{ daysThisMonth() }} <small>day(s)</small></span>
          <span class="s">Approved in current month</span>
        </div>
        <div class="tile">
          <span class="k">Leaves this year</span>
          <span class="v num">{{ daysThisYear() }} <small>day(s)</small></span>
          <span class="s">Total approved in {{ currentYear }}</span>
        </div>
        <div class="tile">
          <span class="k">Total requests</span>
          <span class="v num">{{ totalRequests() }}</span>
          <span class="s">{{ approvedCount() }} approved · {{ pendingCount() }} pending</span>
        </div>
        <div class="tile">
          <span class="k">Rejected requests</span>
          <span class="v num">{{ rejectedCount() }}</span>
          <span class="s">{{ rejectedCount() > 0 ? 'Not approved' : 'No rejected leaves' }}</span>
        </div>
      </div>

      <!-- Leave History List -->
      <section class="card no-pad">
        <div class="ph">
          <app-panel-head
            title="Leave history"
            [subtitle]="'All leave requests submitted by ' + employeeName()"
          />
        </div>
        <ul class="reqs">
          @for (leave of requests(); track leave.id) {
            <li>
              <div class="req-main">
                <p class="dates-line">
                  <mat-icon class="cal-ic" aria-hidden="true">event</mat-icon>
                  {{ leave.start_date }} → {{ leave.end_date }} · {{ leave.days }} day(s)
                </p>
                <p class="reason">{{ leave.reason }}</p>
                @if (leave.decision_note) {
                  <span class="note"><strong>Admin Note:</strong> {{ leave.decision_note }}</span>
                }
                <span class="applied-at">Applied on {{ leave.created_at | date: 'd MMM y' }}</span>
              </div>
              <div class="req-actions">
                @if (isAdmin() && leave.status === 'PENDING') {
                  <button matButton="filled" type="button" (click)="review(leave)">Review</button>
                } @else {
                  <span class="chip" [class]="tint(leave.status)">{{ leave.status }}</span>
                }
              </div>
            </li>
          } @empty {
            <li style="padding: 0;">
              <app-empty-state
                icon="beach_access"
                title="No leave requests found"
                [message]="employeeName() + ' hasn’t submitted any leave requests yet.'"
                [bordered]="false"
              />
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class EmployeeLeavesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(LeavesApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  protected readonly isAdmin = computed(() => this.auth.role() === Role.Admin);
  protected readonly currentYear = new Date().getFullYear();

  protected readonly summary = signal<LeaveSummary | null>(null);
  protected readonly requests = signal<LeaveRequestItem[]>([]);
  protected readonly loading = signal(true);

  protected readonly daysThisMonth = computed(() => {
    const summaryVal = this.summary()?.this_month;
    if (typeof summaryVal === 'number' && summaryVal > 0) {
      return summaryVal;
    }
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const calculated = this.requests()
      .filter((r) => {
        if (r.status !== 'APPROVED') return false;
        const parts = r.start_date.split('-').map(Number);
        return parts[0] === currentYear && parts[1] === currentMonth;
      })
      .reduce((sum, r) => sum + (r.days || 0), 0);
    return calculated || (summaryVal ?? 0);
  });

  protected readonly daysThisYear = computed(() => {
    const summaryVal = this.summary()?.this_year;
    if (typeof summaryVal === 'number' && summaryVal > 0) {
      return summaryVal;
    }
    const currentYear = new Date().getFullYear();
    const calculated = this.requests()
      .filter((r) => {
        if (r.status !== 'APPROVED') return false;
        const parts = r.start_date.split('-').map(Number);
        return parts[0] === currentYear;
      })
      .reduce((sum, r) => sum + (r.days || 0), 0);
    return calculated || (summaryVal ?? 0);
  });
  protected readonly totalRequests = computed(() => this.requests().length);
  protected readonly approvedCount = computed(() => this.requests().filter((r) => r.status === 'APPROVED').length);
  protected readonly pendingCount = computed(() => this.requests().filter((r) => r.status === 'PENDING').length);
  protected readonly rejectedCount = computed(() => this.requests().filter((r) => r.status === 'REJECTED').length);

  protected readonly employeeName = computed(() => {
    return this.summary()?.user?.name || this.requests()[0]?.user?.name || 'Employee';
  });

  protected readonly employeeRole = computed(() => {
    return this.summary()?.user?.role || this.requests()[0]?.user?.role;
  });

  protected readonly tint = (status: LeaveStatus) => STATUS_TINT[status];

  constructor() {
    this.load();
  }

  protected load(): void {
    const userId = Number(this.route.snapshot.paramMap.get('id'));
    if (!userId) return;

    this.loading.set(true);

    this.api.summary(userId).subscribe({
      next: (s) => this.summary.set(s),
      error: () => {},
    });

    this.api.list(1, userId).subscribe({
      next: (res) => {
        this.requests.set(res.results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected review(leave: LeaveRequestItem): void {
    this.dialog
      .open<DecideDialog, DecideDialogData, LeaveRequestItem>(DecideDialog, { data: { leave } })
      .afterClosed()
      .subscribe((decided) => decided && this.load());
  }
}
