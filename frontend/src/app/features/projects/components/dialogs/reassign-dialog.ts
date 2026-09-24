import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { Manager, ProjectDetail, ProjectListItem } from '../../data/project.models';
import { ProjectsApi } from '../../data/projects-api.service';
import { DialogHead } from '../../ui/dialog-head';

export interface ReassignDialogData {
  project: Pick<ProjectListItem, 'id' | 'name'> & { pm?: { id: number; name: string } | null };
}

/** Admin: give a project a manager (or take it away). Shows how many projects each manager is running. */
@Component({
  selector: 'app-reassign-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  template: `
    <app-dialog-head
      headingId="dlg-title"
      [title]="data.project.pm ? 'Reassign project manager' : 'Assign project manager'"
      [subtitle]="data.project.name"
      (closed)="ref.close()"
    />
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="ra-pm">Project manager</label>
        <select id="ra-pm" name="pm" [(ngModel)]="pm">
          @if (data.project.pm) {
            <option value="">No project manager (unassign)</option>
          } @else {
            <option value="">Choose a project manager</option>
          }
          @for (m of managers(); track m.id) {
            <option [value]="'' + m.id">{{ m.name }} · {{ m.running_projects }} running</option>
          }
        </select>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" (click)="ref.close()">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving() || !changed()">{{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  `,
})
export class ReassignDialog {
  protected readonly data = inject<ReassignDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ReassignDialog, ProjectDetail>);
  private readonly api = inject(ProjectsApi);

  protected pm = this.data.project.pm ? String(this.data.project.pm.id) : '';
  protected readonly managers = signal<Manager[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.api.managers().subscribe({
      next: (list) => this.managers.set(list),
      error: (err: ApiError) => this.error.set(err.message),
    });
  }

  protected changed(): boolean {
    return this.pm !== (this.data.project.pm ? String(this.data.project.pm.id) : '');
  }

  protected submit(): void {
    if (this.saving() || !this.changed()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.assignPm(this.data.project.id, this.pm ? Number(this.pm) : null).subscribe({
      next: (project) => this.ref.close(project),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
