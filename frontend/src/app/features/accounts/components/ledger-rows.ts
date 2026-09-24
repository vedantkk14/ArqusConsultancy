import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { LedgerRow } from '../data/account.models';
import { CollectBar, LedgerStateChip, OverduePill, PersonAvatar } from '../ui/bits';
import { formatDay } from '../ui/business-time';

export type RowAction = { kind: 'pay' | 'remind' | 'finalize'; row: LedgerRow };

/** Ledgers as a table (>= 768px) or stacked cards (phones). The client name is the link; buttons stay clickable. */
@Component({
  selector: 'app-ledger-rows',
  imports: [
    CollectBar,
    InrCompactPipe,
    LedgerStateChip,
    MatIconModule,
    MatMenuModule,
    NgTemplateOutlet,
    OverduePill,
    PersonAvatar,
    RouterLink,
    Skeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ledger-rows.html',
  styleUrl: './ledger-rows.scss',
})
export class LedgerRows {
  readonly rows = input.required<LedgerRow[]>();
  readonly layout = input<'table' | 'cards'>('table');
  readonly skeleton = input(false);
  readonly action = output<RowAction>();

  protected readonly placeholders = Array.from({ length: 6 }, (_, i) => i);
  protected readonly day = formatDay;

  protected hasBalance(row: LedgerRow): boolean {
    return row.finalized && !/^0+(\.0+)?$/.test(row.outstanding);
  }

  protected emit(kind: RowAction['kind'], row: LedgerRow): void {
    this.action.emit({ kind, row });
  }
}
