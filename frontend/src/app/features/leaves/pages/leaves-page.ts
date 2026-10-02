import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { RoleBadge } from '../../../shared/role-badge/role-badge';
import { PanelHead } from '../../dashboard/components/panel-head';
import { DecideDialog, DecideDialogData } from '../components/decide-dialog';
import { HolidayDialog } from '../components/holiday-dialog';
import { LeavesCalendar } from '../components/leaves-calendar.component';
import { RequestLeaveDialog } from '../components/request-leave-dialog';
import { Holiday, LeaveRequestItem, LeaveStatus, Person } from '../data/leave.models';
import { LeavesApi } from '../data/leaves-api.service';

interface EmployeeLeaveGroup {
  user: Person;
  requests: LeaveRequestItem[];
  pendingRequests: LeaveRequestItem[];
  hasPending: boolean;
  latestRequest: LeaveRequestItem;
  displayRequest: LeaveRequestItem;
}

const STATUS_TINT: Record<LeaveStatus, string> = { PENDING: 't-amber', APPROVED: 't-teal', REJECTED: 't-slate' };

@Component({
  selector: 'app-leaves-page',
  imports: [EmptyState, MatButtonModule, MatIconModule, MatTooltipModule, PanelHead, LeavesCalendar, RoleBadge, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }

    /* Two-column layout: requests left half, calendar right half */
    .layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-4);
      align-items: start;
    }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
    }

    .card { padding: var(--space-4); margin-bottom: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
    .card.no-pad { padding: 0; }

    /* Left column: calendar stacked above holiday pills */
    .left { display: flex; flex-direction: column; gap: var(--space-4); }

    /* Holiday list */
    .hol-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .hol-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px var(--space-4);
      border-bottom: 1px solid var(--line);
      transition: background 0.15s ease;
    }
    .hol-item:last-child {
      border-bottom: 0;
    }
    .hol-item:hover {
      background: var(--subtle);
    }
    .hol-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .hol-name {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--ink);
    }
    .hol-date {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-xs);
      color: var(--ink-3);
    }
    .hol-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: var(--brand-deep);
    }
    .hol-remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: 1px solid transparent;
      border-radius: var(--radius-control);
      background: transparent;
      color: var(--ink-3);
      cursor: pointer;
      padding: 0;
      transition: all 0.15s ease;
    }
    .hol-remove:hover {
      background: var(--surface);
      border-color: var(--line);
      color: var(--danger, #e53e3e);
    }
    .hol-remove mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .sec-title { font-size: var(--text-sm); font-weight: 600; color: var(--ink); margin: 0; }
    .hint { font-size: var(--text-xs); color: var(--ink-3); margin: 0; }

    /* Right column: requests */
    ul.reqs { margin: 0; padding: 0; list-style: none; }
    ul.reqs li { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px var(--space-4); border-bottom: 1px solid var(--line); }
    ul.reqs li:last-child { border-bottom: 0; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .emp-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 2px; }
    .nm { margin: 0; font-size: var(--text-sm); font-weight: 600; color: var(--ink); }
    a.nm { text-decoration: none; cursor: pointer; transition: color 0.15s ease; }
    a.nm:hover { color: var(--brand-deep); text-decoration: underline; }
    .tag-new {
      display: inline-flex;
      align-items: center;
      padding: 1px 7px;
      background: var(--tint-amber, #fdf0d9);
      color: var(--tint-amber-ink, #86400b);
      border: 1px solid rgba(134, 64, 11, 0.25);
      border-radius: var(--radius-pill, 9999px);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      line-height: 1.4;
    }
    .dates { margin: 0; font-size: var(--text-sm); color: var(--ink-2); }
    .reason { margin: 0; font-size: var(--text-xs); color: var(--ink-3); }
    .chip { padding: 2px 10px; border-radius: var(--radius-pill); font-size: var(--text-xs); font-weight: 600; white-space: nowrap; }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-slate { background: var(--tint-slate); color: var(--tint-slate-ink); }
    .row { display: flex; align-items: center; gap: 8px; flex: none; }
    .ph { padding: var(--space-4); }

    .multi-pending {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 6px;
      width: 100%;
    }
    .pending-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 10px;
      background: var(--subtle);
      border-radius: var(--radius-control);
    }
    .req-sub {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
  `,
  template: `
    <div class="layout">
      <!-- Requests column -->
      <section class="card no-pad">
        <div class="ph">
          <app-panel-head [title]="isAdmin() ? 'All requests' : 'My requests'" [subtitle]="summaryLine()">
            @if (!isAdmin()) {
              <button matButton="filled" type="button" (click)="requestLeave()"><mat-icon>add</mat-icon>Request leave</button>
            }
          </app-panel-head>
        </div>

        @if (isAdmin()) {
          <!-- Admin view: Grouped by employee so each employee has only one section -->
          <ul class="reqs">
            @for (emp of employeeGroups(); track emp.user.id) {
              <li>
                <div class="who">
                  <div class="emp-row">
                    <a class="nm" [routerLink]="['/leaves/employee', emp.user.id]" matTooltip="View leave history">
                      {{ emp.user.name }}
                    </a>
                    @if (emp.user.role) {
                      <app-role-badge [role]="emp.user.role" />
                    }
                    @if (emp.hasPending) {
                      <span class="tag-new">NEW</span>
                    }
                  </div>

                  @if (emp.pendingRequests.length > 1) {
                    <div class="multi-pending">
                      @for (leave of emp.pendingRequests; track leave.id) {
                        <div class="pending-item">
                          <div class="req-sub">
                            <p class="dates">{{ leave.start_date }} → {{ leave.end_date }} · {{ leave.days }} day(s)</p>
                            <p class="reason">{{ leave.reason }}</p>
                          </div>
                          <button matButton="filled" type="button" (click)="review(leave)">Review</button>
                        </div>
                      }
                    </div>
                  } @else {
                    <p class="dates">{{ emp.displayRequest.start_date }} → {{ emp.displayRequest.end_date }} · {{ emp.displayRequest.days }} day(s)</p>
                    <p class="reason">{{ emp.displayRequest.reason }}</p>
                    @if (!emp.hasPending && emp.displayRequest.decision_note) {
                      <p class="reason">Note: {{ emp.displayRequest.decision_note }}</p>
                    }
                  }
                </div>

                @if (emp.pendingRequests.length <= 1) {
                  <div class="row">
                    @if (emp.hasPending) {
                      <button matButton="filled" type="button" (click)="review(emp.displayRequest)">Review</button>
                    } @else {
                      <span class="chip" [class]="tint(emp.displayRequest.status)">{{ emp.displayRequest.status }}</span>
                    }
                  </div>
                }
              </li>
            } @empty {
              <li style="padding: 0;"><app-empty-state icon="beach_access" title="No leave requests yet" [bordered]="false" /></li>
            }
          </ul>
        } @else {
          <!-- Non-admin view: My requests list -->
          <ul class="reqs">
            @for (leave of requests(); track leave.id) {
              <li>
                <div class="who">
                  <p class="dates">{{ leave.start_date }} → {{ leave.end_date }} · {{ leave.days }} day(s)</p>
                  <p class="reason">{{ leave.reason }}</p>
                  @if (leave.decision_note) { <p class="reason">Note: {{ leave.decision_note }}</p> }
                </div>
                <div class="row">
                  <span class="chip" [class]="tint(leave.status)">{{ leave.status }}</span>
                  @if (canDelete(leave)) {
                    <button matButton="outlined" type="button" (click)="remove(leave)" [attr.aria-label]="'Delete leave request'">
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </div>
              </li>
            } @empty {
              <li style="padding: 0;"><app-empty-state icon="beach_access" title="No leave requests yet" [bordered]="false" /></li>
            }
          </ul>
        }
      </section>

      <!-- LEFT: Calendar + holiday pills (admin only) -->
      <div>
        <section class="card">
          <app-leaves-calendar
            [holidays]="holidays()"
            [canAddHoliday]="isAdmin()"
            (dateSelected)="addHoliday($event)">
          </app-leaves-calendar>
        </section>

        <section class="card no-pad" style="margin-top: var(--space-4);">
          <div class="ph" style="padding-bottom: var(--space-2);">
            <p class="sec-title">Holidays</p>
          </div>
          @if (holidays().length === 0) {
            <div style="padding: 0 var(--space-4) var(--space-4);">
              <p class="hint">{{ isAdmin() ? 'No holidays yet. Click a date on the calendar to add one.' : 'No holidays listed yet.' }}</p>
            </div>
          } @else {
            <ul class="hol-list">
              @for (h of holidays(); track h.id) {
                <li class="hol-item">
                  <div class="hol-info">
                    <span class="hol-name">{{ h.name }}</span>
                    <span class="hol-date">
                      <mat-icon class="hol-icon">calendar_today</mat-icon>
                      {{ h.date }}
                    </span>
                  </div>
                  @if (isAdmin()) {
                    <button type="button" class="hol-remove" (click)="removeHoliday(h)" [attr.aria-label]="'Remove ' + h.name">
                      <mat-icon>close</mat-icon>
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </section>
      </div>
    </div>
  `,
})
export class LeavesPage {
  private readonly api = inject(LeavesApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  protected readonly isAdmin = computed(() => this.auth.role() === Role.Admin);
  protected readonly requests = signal<LeaveRequestItem[]>([]);
  protected readonly holidays = signal<Holiday[]>([]);
  protected readonly summary = signal<{ this_month: number; this_year: number } | null>(null);
  protected readonly tint = (status: LeaveStatus) => STATUS_TINT[status];

  protected readonly employeeGroups = computed<EmployeeLeaveGroup[]>(() => {
    const list = this.requests();
    if (!list.length) return [];

    const map = new Map<number, EmployeeLeaveGroup>();

    for (const req of list) {
      const userId = req.user.id;
      let group = map.get(userId);
      if (!group) {
        group = {
          user: req.user,
          requests: [],
          pendingRequests: [],
          hasPending: false,
          latestRequest: req,
          displayRequest: req,
        };
        map.set(userId, group);
      }
      group.requests.push(req);
      if (req.status === 'PENDING') {
        group.pendingRequests.push(req);
      }
    }

    const groups = Array.from(map.values()).map((g) => {
      g.requests.sort((a, b) => b.id - a.id);
      g.pendingRequests.sort((a, b) => b.id - a.id);
      g.hasPending = g.pendingRequests.length > 0;
      g.latestRequest = g.requests[0];
      g.displayRequest = g.hasPending ? g.pendingRequests[0] : g.latestRequest;
      return g;
    });

    groups.sort((a, b) => {
      if (a.hasPending && !b.hasPending) return -1;
      if (!a.hasPending && b.hasPending) return 1;
      return (b.latestRequest?.id ?? 0) - (a.latestRequest?.id ?? 0);
    });

    return groups;
  });

  constructor() {
    this.load();
    this.api.holidays().subscribe((list) => this.holidays.set(list));
    if (!this.isAdmin()) {
      this.api.summary().subscribe((s) => this.summary.set(s));
    }
  }

  protected summaryLine(): string {
    if (this.isAdmin()) return 'Every leave request across the team.';
    const s = this.summary();
    return s ? `${s.this_month} day(s) taken this month · ${s.this_year} this year` : '';
  }

  private load(): void {
    this.api.list().subscribe((res) => this.requests.set(res.results));
  }

  protected requestLeave(): void {
    this.dialog.open(RequestLeaveDialog).afterClosed().subscribe((leave) => leave && this.load());
  }

  protected addHoliday(date?: string): void {
    this.dialog
      .open(HolidayDialog, { data: { date } })
      .afterClosed()
      .subscribe((holiday) => holiday && this.holidays.update((list) => [...list, holiday].sort((a, b) => a.date.localeCompare(b.date))));
  }

  protected removeHoliday(holiday: Holiday): void {
    this.api.removeHoliday(holiday.id).subscribe(() => this.holidays.update((list) => list.filter((h) => h.id !== holiday.id)));
  }

  protected review(leave: LeaveRequestItem): void {
    this.dialog
      .open<DecideDialog, DecideDialogData, LeaveRequestItem>(DecideDialog, { data: { leave } })
      .afterClosed()
      .subscribe((decided) => decided && this.load());
  }

  protected canDelete(leave: LeaveRequestItem): boolean {
    return !this.isAdmin() && leave.status === 'PENDING' && leave.user.id === this.auth.user()?.id;
  }

  protected remove(leave: LeaveRequestItem): void {
    this.api.remove(leave.id).subscribe(() => this.requests.update((list) => list.filter((r) => r.id !== leave.id)));
  }
}
