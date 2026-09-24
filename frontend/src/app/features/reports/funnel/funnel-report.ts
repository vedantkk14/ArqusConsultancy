import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { FunnelCard } from '../../dashboard/components/funnel-card';
import { ReportFrame, reportParams } from '../report-frame';
import { ReportState } from '../report-state';
import { ReportsApi } from '../reports.api';
import { FunnelReport } from '../reports.models';

@Component({
  selector: 'app-funnel-report',
  imports: [FunnelCard, InrPipe, ReportFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './funnel-report.html',
  styleUrls: ['../../team/ui/list-kit.scss', '../report-kit.scss'],
})
export class FunnelReportPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReportsApi);
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly state = new ReportState<FunnelReport>('lead-funnel', (p) => this.api.funnel(p), this.api, inject(MatSnackBar), inject(DestroyRef));
  protected readonly won = computed(() => this.state.data()?.stages.find((s) => s.status === 'WON')?.count ?? 0);

  constructor() {
    effect(() => {
      const p = reportParams(this.qp());
      untracked(() => (p.ready ? this.state.load(p.query) : undefined));
    });
  }
}
