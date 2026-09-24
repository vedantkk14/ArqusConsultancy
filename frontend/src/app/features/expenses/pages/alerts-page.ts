import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { BudgetDialog, BudgetDialogData } from '../../projects/components/dialogs/budget-dialog';
import { AlertProject, ProjectDetail } from '../../projects/data/project.models';
import { ProjectsApi } from '../../projects/data/projects-api.service';
import { BudgetBar, PersonAvatar } from '../../projects/ui/bits';
import { dialogConfig } from '../../projects/ui/open';

/** Admin: running projects at or over their budget, worst first, with the quick actions to fix it. */
@Component({
  selector: 'app-alerts-page',
  imports: [BudgetBar, EmptyState, ErrorState, InrPipe, MatButtonModule, PersonAvatar, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alerts-page.html',
  styleUrl: './alerts-page.scss',
})
export class AlertsPage {
  private readonly api = inject(ProjectsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly rows = signal<AlertProject[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly placeholders = [0, 1, 2];
  protected readonly overCount = computed(() => this.rows().filter((r) => r.state === 'over').length);
  protected readonly insight = computed(() => {
    const over = this.overCount();
    const near = this.rows().length - over;
    const parts = [over ? `${over} over budget` : '', near ? `${near} near the limit` : ''].filter(Boolean);
    return parts.join(' · ');
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.alerts().subscribe({
      next: (res) => {
        this.rows.set(res.results);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected adjust(row: AlertProject): void {
    this.dialog
      .open<BudgetDialog, BudgetDialogData, ProjectDetail>(BudgetDialog, dialogConfig({ project: row }))
      .afterClosed()
      .subscribe((done) => {
        if (done) {
          this.snack.open('Budget updated.', undefined, { duration: 3000 });
          this.load();
        }
      });
  }
}
