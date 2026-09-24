import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { InrPipe } from '../../../../shared/money/inr.pipe';
import { ProjectDetail } from '../../data/project.models';
import { ProjectsApi } from '../../data/projects-api.service';
import { DialogHead } from '../../ui/dialog-head';

export interface CompleteDialogData {
  project: Pick<ProjectDetail, 'id' | 'name' | 'spent' | 'sanctioned_budget'>;
}

@Component({
  selector: 'app-complete-dialog',
  imports: [DialogHead, InrPipe, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head
      headingId="dlg-title"
      title="Complete project"
      [subtitle]="data.project.name"
      (closed)="ref.close()"
    />
    <p class="lead">Spent {{ data.project.spent | inr }} of {{ data.project.sanctioned_budget | inr }}.</p>
    <p class="note warn">You can't add expenses after completing. An admin can reopen the project if needed.</p>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="actions">
      <button matButton type="button" (click)="ref.close()">Cancel</button>
      <button matButton="filled" type="button" [disabled]="saving()" (click)="confirm()">
        {{ saving() ? 'Completing…' : 'Complete project' }}
      </button>
    </div>
  `,
  styles: `
    .lead { margin: 0 0 var(--space-3); color: var(--ink); font-size: var(--text-md); font-weight: 500; }
  `,
})
export class CompleteDialog {
  protected readonly data = inject<CompleteDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<CompleteDialog, ProjectDetail>);
  private readonly api = inject(ProjectsApi);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected confirm(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.complete(this.data.project.id).subscribe({
      next: (project) => this.ref.close(project),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
