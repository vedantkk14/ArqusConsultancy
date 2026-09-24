import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { InrCompactPipe, InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { LeadListItem, LeadStatus, ListMode, STATUS_LABELS } from '../data/lead.models';
import { atBusinessTime, formatBusiness, formatBusinessFull, nextMonday, relativeLabel } from '../utils/business-time';
import { formatPhone, toTelHref } from '../utils/phone';
import { FollowupPill, LeadAvatar, LeadStatusChip } from './lead-bits';

export type RowAction =
  | { kind: 'whatsapp' | 'assign' | 'finalize' | 'pick-snooze'; lead: LeadListItem }
  | { kind: 'status'; lead: LeadListItem; to: LeadStatus }
  | { kind: 'snooze'; lead: LeadListItem; at: string };

/** Leads as a table (>= 768px) or stacked cards (phones). The name is the link; buttons stay clickable. */
@Component({
  selector: 'app-lead-rows',
  imports: [
    FollowupPill,
    InrCompactPipe,
    InrPipe,
    LeadAvatar,
    LeadStatusChip,
    MatIconModule,
    MatMenuModule,
    NgTemplateOutlet,
    RouterLink,
    Skeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lead-rows.html',
  styleUrl: './lead-rows.scss',
})
export class LeadRows {
  readonly rows = input.required<LeadListItem[]>();
  readonly layout = input<'table' | 'cards'>('table');
  readonly mode = input<ListMode>('all');
  readonly selectable = input(false);
  readonly selected = input<ReadonlySet<number>>(new Set());
  readonly canAssign = input(false);
  readonly canFinalize = input(false);
  readonly skeleton = input(false);
  readonly now = input<Date>(new Date());
  readonly toggled = output<number>();
  readonly toggledAll = output<boolean>();
  readonly action = output<RowAction>();

  protected readonly formatPhone = formatPhone;
  protected readonly tel = toTelHref;
  protected readonly relative = relativeLabel;
  protected readonly full = formatBusinessFull;
  protected readonly placeholders = Array.from({ length: 6 }, (_, i) => i);
  protected readonly allSelected = computed(
    () => this.rows().length > 0 && this.rows().every((r) => this.selected().has(r.id)),
  );
  protected readonly someSelected = computed(() => !this.allSelected() && this.rows().some((r) => this.selected().has(r.id)));

  protected snoozeOptions(): { label: string; at: string }[] {
    const now = this.now();
    return [
      { label: 'Tomorrow 10 am', at: atBusinessTime(1, 10, 0, now) },
      { label: 'In 3 days', at: atBusinessTime(3, 10, 0, now) },
      { label: 'Next Monday', at: nextMonday(10, now) },
    ];
  }

  protected label(status: string): string {
    return STATUS_LABELS[status as LeadStatus] ?? status;
  }

  protected wonOn(lead: LeadListItem): string {
    return lead.won_at ? formatBusiness(lead.won_at, this.now()).split(',')[0] : '';
  }

  protected waiting(lead: LeadListItem): string {
    return lead.won_at ? relativeLabel(lead.won_at, this.now()).replace(' ago', '') : '';
  }

  protected emit(kind: 'whatsapp' | 'assign' | 'finalize' | 'pick-snooze', lead: LeadListItem): void {
    this.action.emit({ kind, lead });
  }
}
