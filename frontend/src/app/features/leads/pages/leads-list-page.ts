import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { interval, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { ImportDialog } from '../components/dialogs/import-dialog';
import { AssignDialog, AssignDialogData } from '../components/dialogs/assign-dialog';
import { FinalizeDialog, FinalizeDialogData } from '../components/dialogs/finalize-dialog';
import { SnoozeDialog } from '../components/dialogs/snooze-dialog';
import { StatusDialog, StatusDialogData } from '../components/dialogs/status-dialog';
import { WhatsAppDialog, WhatsAppDialogData } from '../components/dialogs/whatsapp-dialog';
import { LeadFiltersBar } from '../components/lead-filters';
import { LeadRows, RowAction } from '../components/lead-rows';
import { Assignee, EMPTY_FILTERS, LeadDetail, LeadFilters, LeadListItem, ListMode } from '../data/lead.models';
import { LeadsApi } from '../data/leads-api.service';
import { LeadsListStore, filtersFromQuery, toQuery } from '../data/leads-list.store';

const MANAGERS: Role[] = [Role.Admin, Role.SalesManager];

/** Compose the header insight from summary counts, skipping zero parts. */
export function listInsight(s: { overdue: number; untouched: number; today: number } | null): string {
  if (!s) {
    return '';
  }
  const parts: string[] = [];
  if (s.overdue) {
    parts.push(`${s.overdue} ${s.overdue === 1 ? 'follow-up' : 'follow-ups'} overdue`);
  }
  if (s.today) {
    parts.push(`${s.today} due today`);
  }
  if (s.untouched) {
    parts.push(`${s.untouched} new ${s.untouched === 1 ? 'lead' : 'leads'} not yet contacted`);
  }
  return parts.length ? parts.join(' · ') : 'Nothing overdue. Nice work.';
}

/** One page for All / Overdue / Won - awaiting finalization (mode from the route data). */
@Component({
  selector: 'app-leads-list-page',
  imports: [EmptyState, ErrorState, LeadFiltersBar, LeadRows, MatButtonModule, MatIconModule, RouterLink],
  providers: [LeadsListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leads-list-page.html',
  styleUrl: './leads-list-page.scss',
})
export class LeadsListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(LeadsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly store = inject(LeadsListStore);

  protected readonly mode: ListMode = this.route.snapshot.data['mode'] ?? 'all';
  protected readonly isManager = computed(() => MANAGERS.includes(this.auth.role() as Role));
  protected readonly isAdmin = computed(() => this.auth.role() === Role.Admin);

  private readonly queryMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly filters = computed(() => filtersFromQuery((k) => this.queryMap().get(k)));
  protected readonly query = computed(() => toQuery(this.mode, this.filters()), {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });
  protected readonly now = toSignal(interval(60_000).pipe(map(() => new Date())), { initialValue: new Date() });
  protected readonly assignees = signal<Assignee[]>([]);

  protected readonly insight = computed(() => (this.mode === 'all' ? listInsight(this.store.summary()) : ''));
  protected readonly countText = computed(() => {
    const n = this.store.count();
    const kind = this.mode === 'won' ? 'won ' : this.mode === 'lost' ? 'lost ' : '';
    return this.store.loaded() ? `${n} ${kind}${n === 1 ? 'lead' : 'leads'}` : 'Loading…';
  });
  protected readonly note = this.mode === 'won'
    ? 'A won deal is final once payment is received. Until then a manager can still mark it lost.'
    : this.mode === 'lost'
      ? 'Lost leads stay here. A manager can reopen one as Contacted.'
      : '';
  protected readonly awaitingOnly = computed(() => this.filters().won_awaiting === 'true');
  protected readonly hasFilters = computed(() =>
    Object.entries(this.filters()).some(([key, value]) => key !== 'ordering' && value !== ''),
  );
  protected readonly selectedCount = computed(() => this.store.selected().size);

  constructor() {
    effect(() => {
      const query = this.query();
      untracked(() => this.store.load(query));
    });
    if (this.isManager()) {
      this.api.assignees().subscribe({ next: (list) => this.assignees.set(list), error: () => undefined });
    }
  }

  // ---- Filters (URL is the source of truth) ---------------------------------------------------------

  protected setFilters(patch: Partial<LeadFilters>): void {
    this.navigate(patch);
  }

  protected clearFilters(): void {
    this.navigate({ ...EMPTY_FILTERS });
  }

  protected setAwaiting(on: boolean): void {
    this.navigate({ won_awaiting: on ? 'true' : '' });
  }

  private navigate(patch: Record<string, string>): void {
    const queryParams = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === '' ? null : v]));
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  // ---- Actions --------------------------------------------------------------------------------------

  protected onAction(action: RowAction): void {
    const lead = action.lead;
    switch (action.kind) {
      case 'whatsapp':
        this.dialog
          .open<WhatsAppDialog, WhatsAppDialogData, boolean>(WhatsAppDialog, { data: { lead } })
          .afterClosed()
          .subscribe((sent) => sent && this.store.reload());
        break;
      case 'assign':
        this.openAssign([lead.id], lead.name, lead.assigned_to?.id);
        break;
      case 'status':
        this.dialog
          .open<StatusDialog, StatusDialogData, LeadDetail>(StatusDialog, { data: { lead, to: action.to } })
          .afterClosed()
          .subscribe((updated) => {
            if (!updated) {
              return;
            }
            const where = updated.status === 'WON' ? 'Won leads' : updated.status === 'LOST' ? 'Lost leads' : '';
            this.snack.open(where ? `${lead.name} moved to ${where}.` : `${lead.name} updated.`, undefined, { duration: 3500 });
            this.store.reload();
          });
        break;
      case 'snooze':
        this.snooze(lead, action.at);
        break;
      case 'pick-snooze':
        this.dialog
          .open<SnoozeDialog, { name: string }, string>(SnoozeDialog, { data: { name: lead.name } })
          .afterClosed()
          .subscribe((at) => at && this.snooze(lead, at));
        break;
      case 'finalize':
        this.finalize(lead);
        break;
    }
  }

  protected bulkAssign(): void {
    const ids = this.store.selectedIds();
    this.openAssign(ids, `${ids.length} ${ids.length === 1 ? 'lead' : 'leads'}`);
  }

  protected importLeads(): void {
    this.dialog
      .open<ImportDialog, void, number>(ImportDialog, { width: '640px', maxWidth: 'calc(100vw - 32px)' })
      .afterClosed()
      .subscribe((created) => {
        if (created) {
          this.store.reload();
          this.snack.open(`${created} ${created === 1 ? 'lead' : 'leads'} imported.`, undefined, { duration: 4000 });
        }
      });
  }

  protected exportCsv(): void {
    this.api.exportCsv(this.query()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leads.csv';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open("Couldn't export the leads. Try again.", 'Dismiss', { duration: 5000 }),
    });
  }

  private openAssign(ids: number[], label: string, currentId?: number | null): void {
    this.dialog
      .open<AssignDialog, AssignDialogData, boolean>(AssignDialog, { data: { ids, label, currentId } })
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open(`Assigned ${label}.`, undefined, { duration: 3000 });
          this.store.clearSelection();
          this.store.reload();
        }
      });
  }

  /** Optimistic: the row leaves Overdue at once and comes back if the save fails. */
  snooze(lead: LeadListItem, at: string): void {
    const apply = () => (this.mode === 'overdue' ? this.store.removeRow(lead.id) : this.store.patchRow(lead.id, { next_followup_at: at }));
    this.store.optimistic(apply, this.api.update(lead.id, { next_followup_at: at })).subscribe((res) => {
      if (res) {
        this.store.refreshSummary();
        this.snack.open(`Snoozed ${lead.name}.`, undefined, { duration: 3000 });
      } else {
        this.snack.open(`Couldn't snooze ${lead.name}.`, 'Dismiss', { duration: 5000 });
      }
    });
  }

  private finalize(lead: LeadListItem): void {
    this.dialog
      .open<FinalizeDialog, FinalizeDialogData, LeadDetail>(FinalizeDialog, { data: { lead } })
      .afterClosed()
      .subscribe((done) => {
        if (!done) {
          return;
        }
        if (this.mode === 'won') {
          this.store.patchRow(lead.id, { finalized: true });
        } else {
          this.store.removeRow(lead.id);
        }
        this.store.refreshSummary();
        this.snack
          .open(`${lead.name} finalized.`, 'Convert to project', { duration: 8000 })
          .onAction()
          .subscribe(() => void this.router.navigate(['/projects/convert'], { queryParams: { lead: lead.id } }));
      });
  }
}
