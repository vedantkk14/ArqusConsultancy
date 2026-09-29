import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { PanelHead } from '../../dashboard/components/panel-head';
import { DecideDialog, DecideDialogData } from '../components/decide-dialog';
import { HolidayDialog } from '../components/holiday-dialog';
import { RequestLeaveDialog } from '../components/request-leave-dialog';
import { Holiday, LeaveRequestItem, LeaveStatus } from '../data/leave.models';
import { LeavesApi } from '../data/leaves-api.service';

const STATUS_TINT: Record<LeaveStatus, string> = { PENDING: 't-amber', APPROVED: 't-teal', REJECTED: 't-slate' };

@Component({
  selector: 'app-leaves-page',
  imports: [EmptyState, MatButtonModule, MatIconModule, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .card { padding: var(--space-5); margin-bottom: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
    .hols { display: flex; flex-wrap: wrap; gap: 10px; }
    .hol { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius-control); font-size: var(--text-sm); }
    .hol .d { color: var(--ink-3); font-size: var(--text-xs); }
    .hol button { display: grid; place-items: center; border: 0; background: transparent; color: var(--ink-3); cursor: pointer; }
    ul.reqs { margin: 0; padding: 0; list-style: none; }
    ul.reqs li { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
    ul.reqs li:last-child { border-bottom: 0; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .nm { margin: 0; font-size: var(--text-sm); font-weight: 600; color: var(--ink); }
    .dates { margin: 0; font-size: var(--text-sm); color: var(--ink-2); }
    .reason { margin: 0; font-size: var(--text-xs); color: var(--ink-3); }
    .chip { padding: 2px 10px; border-radius: var(--radius-pill); font-size: var(--text-xs); font-weight: 600; white-space: nowrap; }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-slate { background: var(--tint-slate); color: var(--tint-slate-ink); }
    .row { display: flex; align-items: center; gap: 8px; flex: none; }
  `,
  template: `
    @if (isAdmin()) {
      <section class="card">
        <app-panel-head title="Pending requests" subtitle="Approve or reject, based on the employee's leave history." />
        <ul class="reqs">
          @for (leave of pending(); track leave.id) {
            <li>
              <div class="who">
                <p class="nm">{{ leave.user.name }}</p>
                <p class="dates">{{ leave.start_date }} to {{ leave.end_date }} · {{ leave.days }} day(s)</p>
                <p class="reason">{{ leave.reason }}</p>
              </div>
              <button matButton="filled" type="button" (click)="review(leave)">Review</button>
            </li>
          } @empty {
            <app-empty-state icon="event_available" title="Nothing pending" message="New leave requests will show up here." [bordered]="false" />
          }
        </ul>
      </section>
    }

    <section class="card">
      <app-panel-head title="Holidays" subtitle="The standard calendar." />
      @if (isAdmin()) {
        <button matButton="outlined" type="button" (click)="addHoliday()" style="margin-bottom: var(--space-4);">
          <mat-icon>add</mat-icon>Add holiday
        </button>
      }
      <div class="hols">
        @for (h of holidays(); track h.id) {
          <span class="hol">
            {{ h.name }}<span class="d">{{ h.date }}</span>
            @if (isAdmin()) {
              <button type="button" (click)="removeHoliday(h)" [attr.aria-label]="'Remove ' + h.name">
                <mat-icon style="width: 16px; height: 16px; font-size: 16px;">close</mat-icon>
              </button>
            }
          </span>
        } @empty {
          <app-empty-state icon="event" title="No holidays added yet" [bordered]="false" />
        }
      </div>
    </section>

    <section class="card">
      <app-panel-head [title]="isAdmin() ? 'All requests' : 'My requests'" [subtitle]="summaryLine()">
        <button matButton="filled" type="button" (click)="requestLeave()"><mat-icon>add</mat-icon>Request leave</button>
      </app-panel-head>
      <ul class="reqs">
        @for (leave of requests(); track leave.id) {
          <li>
            <div class="who">
              @if (isAdmin()) {
                <p class="nm">{{ leave.user.name }}</p>
              }
              <p class="dates">{{ leave.start_date }} to {{ leave.end_date }} · {{ leave.days }} day(s)</p>
              <p class="reason">{{ leave.reason }}</p>
              @if (leave.decision_note) {
                <p class="reason">Note: {{ leave.decision_note }}</p>
              }
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
          <app-empty-state icon="beach_access" title="No leave requests yet" [bordered]="false" />
        }
      </ul>
    </section>
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
  protected readonly pending = computed(() => this.requests().filter((r) => r.status === 'PENDING'));
  protected readonly tint = (status: LeaveStatus) => STATUS_TINT[status];

  constructor() {
    this.load();
    this.api.holidays().subscribe((list) => this.holidays.set(list));
    if (!this.isAdmin()) {
      this.api.summary().subscribe((s) => this.summary.set(s));
    }
  }

  protected summaryLine(): string {
    if (this.isAdmin()) {
      return 'Every leave request across the team.';
    }
    const s = this.summary();
    return s ? `${s.this_month} day(s) taken this month · ${s.this_year} this year` : '';
  }

  private load(): void {
    this.api.list().subscribe((res) => this.requests.set(res.results));
  }

  protected requestLeave(): void {
    this.dialog
      .open(RequestLeaveDialog)
      .afterClosed()
      .subscribe((leave) => leave && this.load());
  }

  protected addHoliday(): void {
    this.dialog
      .open(HolidayDialog)
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

  /** Sales Manager / Sales Exec / Project Manager can withdraw their own still-pending request. */
  protected canDelete(leave: LeaveRequestItem): boolean {
    return !this.isAdmin() && leave.status === 'PENDING' && leave.user.id === this.auth.user()?.id;
  }

  protected remove(leave: LeaveRequestItem): void {
    this.api.remove(leave.id).subscribe(() => this.requests.update((list) => list.filter((r) => r.id !== leave.id)));
  }
}
