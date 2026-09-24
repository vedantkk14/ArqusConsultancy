import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup, transferArrayItem } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { Observable, catchError, of } from 'rxjs';
import { QueryParams } from '../../../core/api/api.service';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { LEAD_STATUSES, LeadDetail, LeadListItem, LeadStatus, LeadSummary, STATUS_LABELS } from '../data/lead.models';
import { LeadsApi } from '../data/leads-api.service';
import { formatPhone } from '../utils/phone';
import { StatusDialog, StatusDialogData } from './dialogs/status-dialog';
import { FollowupPill, LeadAvatar, STATUS_TINT } from './lead-bits';

export const BOARD_PAGE_SIZE = 15;
const NEEDS_DIALOG: LeadStatus[] = ['WON', 'LOST'];

interface Column {
  status: LeadStatus;
  rows: LeadListItem[];
  count: number;
  page: number;
  loading: boolean;
}

/** One column per status. Counts and values come from /summary; the browser never sums money. */
@Component({
  selector: 'app-leads-board',
  imports: [
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    FollowupPill,
    InrCompactPipe,
    LeadAvatar,
    MatIconModule,
    MatMenuModule,
    RouterLink,
    Skeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leads-board.html',
  styleUrl: './leads-board.scss',
})
export class LeadsBoard {
  readonly query = input.required<QueryParams>();
  readonly summary = input<LeadSummary | null>(null);
  readonly now = input<Date>(new Date());
  /** A card changed column: the page refreshes the summary. */
  readonly moved = output<void>();

  private readonly api = inject(LeadsApi);
  private readonly dialog = inject(MatDialog);

  protected readonly labels = STATUS_LABELS;
  protected readonly tint = STATUS_TINT;
  protected readonly formatPhone = formatPhone;
  protected readonly columns = signal<Column[]>(LEAD_STATUSES.map((status) => this.emptyColumn(status)));
  protected readonly shaking = signal<number | null>(null);
  protected readonly announcement = signal('');

  constructor() {
    effect(() => {
      const query = this.query();
      untracked(() => {
        this.columns.set(LEAD_STATUSES.map((status) => ({ ...this.emptyColumn(status), loading: true })));
        LEAD_STATUSES.forEach((status) => this.fetch(status, 1, query));
      });
    });
  }

  protected headerFor(status: LeadStatus): { count: number; value: string } | null {
    const row = this.summary()?.by_status.find((s) => s.status === status);
    return row ? { count: row.count, value: row.value } : null;
  }

  protected loadMore(col: Column): void {
    this.patchColumn(col.status, { loading: true });
    this.fetch(col.status, col.page + 1, this.query());
  }

  protected drop(event: CdkDragDrop<LeadStatus, LeadStatus, LeadListItem>): void {
    const from = event.previousContainer.data;
    const to = event.container.data;
    if (from === to) {
      return;
    }
    this.move(event.item.data, to, { from: event.previousIndex, to: event.currentIndex });
  }

  /** Keyboard / menu path and the drop path share this. */
  protected move(lead: LeadListItem, to: LeadStatus, index?: { from: number; to: number }): void {
    if (!lead.allowed_transitions.includes(to)) {
      this.reject(lead, to);
      return;
    }
    const undo = this.transfer(lead, to, index?.to ?? 0);
    const request: Observable<LeadDetail | null | undefined> = NEEDS_DIALOG.includes(to)
      ? this.dialog
          .open<StatusDialog, StatusDialogData, LeadDetail>(StatusDialog, { data: { lead, to }, autoFocus: 'first-tabbable' })
          .afterClosed()
      : this.api.changeStatus(lead.id, { status: to }).pipe(catchError(() => of(null)));
    request.subscribe((updated) => {
      if (!updated) {
        undo();
        this.announcement.set(`${lead.name} stayed in ${STATUS_LABELS[lead.status]}.`);
        return;
      }
      this.replace(to, { ...lead, ...updated });
      this.announcement.set(`${lead.name} moved to ${STATUS_LABELS[to]}.`);
      this.moved.emit();
    });
  }

  private reject(lead: LeadListItem, to: LeadStatus): void {
    this.shaking.set(lead.id);
    setTimeout(() => this.shaking.set(null), 450);
    this.announcement.set(`${lead.name} can't move from ${STATUS_LABELS[lead.status]} to ${STATUS_LABELS[to]}.`);
  }

  /** Move the card locally; returns an undo. */
  private transfer(lead: LeadListItem, to: LeadStatus, index: number): () => void {
    const before = this.columns();
    this.columns.update((cols) => {
      const next = cols.map((c) => ({ ...c, rows: [...c.rows] }));
      const src = next.find((c) => c.status === lead.status)!;
      const dst = next.find((c) => c.status === to)!;
      const at = src.rows.findIndex((r) => r.id === lead.id);
      if (at >= 0) {
        transferArrayItem(src.rows, dst.rows, at, Math.min(index, dst.rows.length));
        src.count = Math.max(0, src.count - 1);
        dst.count += 1;
      }
      return next;
    });
    return () => this.columns.set(before);
  }

  private replace(status: LeadStatus, lead: LeadListItem): void {
    this.columns.update((cols) =>
      cols.map((c) => (c.status === status ? { ...c, rows: c.rows.map((r) => (r.id === lead.id ? lead : r)) } : c)),
    );
  }

  private fetch(status: LeadStatus, page: number, query: QueryParams): void {
    const { status: _ignored, ...rest } = query;
    this.api
      .list({ ...rest, status, page, page_size: BOARD_PAGE_SIZE })
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        if (this.query() !== query) {
          return; // filters changed meanwhile
        }
        this.columns.update((cols) =>
          cols.map((c) =>
            c.status !== status
              ? c
              : res
                ? { ...c, page, count: res.count, loading: false, rows: page === 1 ? res.results : [...c.rows, ...res.results] }
                : { ...c, loading: false },
          ),
        );
      });
  }

  private patchColumn(status: LeadStatus, patch: Partial<Column>): void {
    this.columns.update((cols) => cols.map((c) => (c.status === status ? { ...c, ...patch } : c)));
  }

  private emptyColumn(status: LeadStatus): Column {
    return { status, rows: [], count: 0, page: 0, loading: false };
  }
}
