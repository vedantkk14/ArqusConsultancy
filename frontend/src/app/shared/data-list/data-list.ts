import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { InrPipe } from '../money/inr.pipe';
import { Skeleton } from '../skeleton/skeleton';
import { StatusChip } from '../status-chip/status-chip';

export interface DataColumn {
  key: string;
  label: string;
  type?: 'text' | 'money' | 'date' | 'status';
  align?: 'start' | 'end';
  /** Hide below 600px (the row becomes a stacked card there). */
  hideOnMobile?: boolean;
}

export type DataRow = Record<string, string | number | null>;

/**
 * Simple read-only list: a table on wide screens, stacked rows on phones.
 * Light header, 48px rows, no zebra stripes, subtle row hover.
 */
@Component({
  selector: 'app-data-list',
  imports: [DatePipe, InrPipe, Skeleton, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './data-list.html',
  styleUrl: './data-list.scss',
})
export class DataList {
  readonly columns = input.required<DataColumn[]>();
  readonly rows = input<DataRow[]>([]);
  readonly loading = input(false);
  readonly emptyText = input('Nothing here yet');
  /** Accessible name of the table. */
  readonly label = input.required<string>();

  protected readonly skeletonRows = [0, 1, 2, 3];

  protected text(row: DataRow, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }
}
