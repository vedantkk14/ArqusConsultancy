import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { ReportFrame, reportParams } from '../report-frame';
import { ReportState } from '../report-state';
import { ReportsApi } from '../reports.api';
import { MarginReport, MarginRow } from '../reports.models';

/** Rows sorted by live margin; a project without one yet sorts last either way. */
export function sortByMargin(rows: MarginRow[], desc: boolean): MarginRow[] {
  const value = (r: MarginRow) => (r.live_margin === null ? null : Number(r.live_margin));
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) {
      return x === y ? 0 : x === null ? 1 : -1;
    }
    return desc ? y - x : x - y;
  });
}

@Component({
  selector: 'app-margin-report',
  imports: [EmptyState, InrPipe, ReportFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './margin-report.html',
  styleUrls: ['../../team/ui/list-kit.scss', '../report-kit.scss'],
})
export class MarginReportPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReportsApi);
  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), { initialValue: true });
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly state = new ReportState<MarginReport>('project-margin', (p) => this.api.margin(p), this.api, inject(MatSnackBar), inject(DestroyRef));
  protected readonly desc = signal(true);
  protected readonly rows = computed(() => sortByMargin(this.state.data()?.rows ?? [], this.desc()));

  constructor() {
    effect(() => {
      const p = reportParams(this.qp());
      untracked(() => (p.ready ? this.state.load(p.query) : undefined));
    });
  }

  protected flip(): void {
    this.desc.update((v) => !v);
  }

  protected tone(v: string | null): string {
    return v === null ? '' : Number(v) < 0 ? 'neg' : 'pos';
  }
}
