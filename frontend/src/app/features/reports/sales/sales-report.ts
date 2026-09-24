import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { ReportFrame, reportParams } from '../report-frame';
import { ReportState } from '../report-state';
import { ReportsApi } from '../reports.api';
import { SalesReport } from '../reports.models';

@Component({
  selector: 'app-sales-report',
  imports: [InrPipe, ReportFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-report.html',
  styleUrls: ['../../team/ui/list-kit.scss', '../report-kit.scss'],
})
export class SalesReportPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReportsApi);
  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), { initialValue: true });
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly state = new ReportState<SalesReport>('sales', (p) => this.api.sales(p), this.api, inject(MatSnackBar), inject(DestroyRef));
  /** Bar length is each executive's won value against the best one (geometry only). */
  protected readonly widths = computed(() => {
    const rows = this.state.data()?.rows ?? [];
    const max = Math.max(0, ...rows.map((r) => Number(r.won_value)));
    return new Map(rows.map((r) => [r.user_id, max ? Math.max(2, Math.round((Number(r.won_value) / max) * 100)) : 0]));
  });

  constructor() {
    effect(() => {
      const p = reportParams(this.qp());
      untracked(() => (p.ready ? this.state.load(p.query) : undefined));
    });
  }
}
