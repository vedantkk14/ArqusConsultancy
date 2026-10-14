import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { ProjectDetail } from '../../data/project.models';
import { ProjectsApi } from '../../data/projects-api.service';
import { DialogHead } from '../../ui/dialog-head';
import { fieldError } from '../../ui/open';

export interface EditDatesDialogData {
  project: Pick<ProjectDetail, 'id' | 'name' | 'start_date' | 'expected_end_date'>;
}

@Component({
  selector: 'app-edit-dates-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head
      headingId="dlg-title"
      title="Edit project dates"
      [subtitle]="data.project.name"
      (closed)="ref.close()"
    />
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="ed-start">Start date</label>
        <input
          id="ed-start"
          name="start_date"
          type="date"
          [(ngModel)]="startDate"
          (ngModelChange)="clearError()"
        />
      </div>

      <div class="field">
        <label for="ed-end">Expected end date</label>
        <input
          id="ed-end"
          name="expected_end_date"
          type="date"
          [(ngModel)]="expectedEndDate"
          (ngModelChange)="clearError()"
        />
      </div>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <div class="actions">
        <button matButton type="button" (click)="ref.close()">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving() || !changed()">
          {{ saving() ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  `,
})
export class EditDatesDialog {
  protected readonly data = inject<EditDatesDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<EditDatesDialog, ProjectDetail>);
  private readonly api = inject(ProjectsApi);

  protected startDate = this.data.project.start_date ?? '';
  protected expectedEndDate = this.data.project.expected_end_date ?? '';
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected clearError(): void {
    this.error.set('');
  }

  protected changed(): boolean {
    const origStart = this.data.project.start_date ?? '';
    const origEnd = this.data.project.expected_end_date ?? '';
    return this.startDate !== origStart || this.expectedEndDate !== origEnd;
  }

  protected submit(): void {
    if (this.saving() || !this.changed()) {
      return;
    }
    if (this.startDate && this.expectedEndDate && this.expectedEndDate < this.startDate) {
      this.error.set('The expected end date cannot be before the start date.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .update(this.data.project.id, {
        start_date: this.startDate || null,
        expected_end_date: this.expectedEndDate || null,
      })
      .subscribe({
        next: (project) => this.ref.close(project),
        error: (err: ApiError) => {
          this.saving.set(false);
          this.error.set(
            fieldError(err, 'expected_end_date') ||
              fieldError(err, 'start_date') ||
              err.message ||
              'Failed to update project dates.',
          );
        },
      });
  }
}
