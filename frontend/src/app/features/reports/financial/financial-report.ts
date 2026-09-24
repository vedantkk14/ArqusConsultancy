import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { InrCompactPipe, InrPipe } from '../../../shared/money/inr.pipe';
import { ReportFrame, reportParams } from '../report-frame';
import { ReportState } from '../report-state';
import { ReportsApi } from '../reports.api';
import { FinancialReport, monthShort } from '../reports.models';

@Component({
  selector: 'app-financial-report',
  imports: [InrCompactPipe, InrPipe, ReportFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './financial-report.html',
  styleUrls: ['../../team/ui/list-kit.scss', '../report-kit.scss', './financial-report.scss'],
})
export class FinancialReportPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReportsApi);
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly state = new ReportState<FinancialReport>('financial', (p) => this.api.financial(p), this.api, inject(MatSnackBar), inject(DestroyRef));
  protected readonly month = monthShort;
  /** Column heights (%) for received and spent, scaled to the largest month (geometry only). */
  protected readonly cols = computed(() => {
    const d = this.state.data();
    if (!d) {
      return [];
    }
    const max = Math.max(0, ...d.received.map(Number), ...d.spent.map(Number));
    const h = (v: string) => (max ? Math.max(Number(v) > 0 ? 3 : 0, Math.round((Number(v) / max) * 100)) : 0);
    return d.months.map((m, i) => ({ m, r: d.received[i], s: d.spent[i], rh: h(d.received[i]), sh: h(d.spent[i]) }));
  });
  protected readonly quiet = computed(() => this.cols().every((c) => c.rh === 0 && c.sh === 0));

  constructor() {
    effect(() => {
      const p = reportParams(this.qp());
      untracked(() => (p.ready ? this.state.load(p.query) : undefined));
    });
  }
}
