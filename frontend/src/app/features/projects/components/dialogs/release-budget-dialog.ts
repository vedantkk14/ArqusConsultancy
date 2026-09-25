import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { map } from 'rxjs';
import { ApiError } from '../../../../core/models';
import { InrPipe } from '../../../../shared/money/inr.pipe';
import { ProjectDetail } from '../../data/project.models';
import { ProjectsApi } from '../../data/projects-api.service';
import { DialogHead } from '../../ui/dialog-head';
import { fieldError } from '../../ui/open';

export interface ReleaseBudgetDialogData {
  project: Pick<ProjectDetail, 'id' | 'name' | 'spent' | 'sanctioned_budget' | 'remaining'>;
}

export interface ReleaseResult {
  released: string;
  to_project: { id: number; name: string } | null;
  project: ProjectDetail;
}

/** Admin, completed project under budget: keep the unused money as margin, or give it to a running project. */
@Component({
  selector: 'app-release-budget-dialog',
  imports: [DialogHead, FormsModule, InrPipe, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../ui/dialog.scss',
  styles: `
    .choice { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-control); cursor: pointer; }
    .choice + .choice { margin-top: 8px; }
    .choice:has(input:checked) { border-color: var(--brand-deep); background: var(--brand-tint); }
    .choice input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--brand-deep); }
    .choice strong { display: block; color: var(--ink); }
    .choice span { color: var(--ink-3); font-size: var(--text-sm); }
    .big { margin: 0 0 var(--space-4); padding: 12px; border-radius: var(--radius-control); background: var(--tint-teal); color: var(--tint-teal-ink); font-size: var(--text-sm); }
    .big b { font-size: var(--text-lg); }
    select { margin-top: 8px; }
  `,
  template: `
    <app-dialog-head headingId="dlg-title" title="Use the unused budget" [subtitle]="data.project.name" (closed)="ref.close()" />
    <p class="big"><b>{{ data.project.remaining | inr }}</b> was not spent (sanctioned {{ data.project.sanctioned_budget | inr }}, spent {{ data.project.spent | inr }}).</p>
    <form (ngSubmit)="submit()" novalidate>
      <label class="choice">
        <input type="radio" name="mode" value="margin" [(ngModel)]="mode" />
        <div><strong>Keep it as project margin</strong><span>The budget is closed at what was spent, so the unused amount adds to this project's margin.</span></div>
      </label>
      <label class="choice">
        <input type="radio" name="mode" value="move" [(ngModel)]="mode" />
        <div>
          <strong>Use it for another project</strong>
          <span>Add the unused amount to a running project's sanctioned budget.</span>
          @if (mode === 'move') {
            <select name="target" [(ngModel)]="target" aria-label="Running project">
              <option [ngValue]="null" disabled>Choose a running project</option>
              @for (r of running(); track r.id) {
                <option [ngValue]="r.id">{{ r.name }} · {{ r.remaining | inr }} left</option>
              }
            </select>
          }
        </div>
      </label>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <div class="actions">
        <button matButton type="button" (click)="ref.close()">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving() || (mode === 'move' && !target)">{{ saving() ? 'Saving…' : 'Confirm' }}</button>
      </div>
    </form>
  `,
})
export class ReleaseBudgetDialog {
  protected readonly data = inject<ReleaseBudgetDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ReleaseBudgetDialog, ReleaseResult>);
  private readonly api = inject(ProjectsApi);
  protected mode: 'margin' | 'move' = 'margin';
  protected target: number | null = null;
  protected readonly running = toSignal(
    this.api.list({ status: 'RUNNING', page_size: 100 }).pipe(map((r) => r.results.filter((p) => p.id !== this.data.project.id))),
    { initialValue: [] },
  );
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected submit(): void {
    this.saving.set(true);
    this.error.set('');
    this.api.releaseBudget(this.data.project.id, this.mode === 'move' ? this.target : null).subscribe({
      next: (r) => this.ref.close(r),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(fieldError(err, 'target_project') || fieldError(err, 'project') || fieldError(err, 'sanctioned_budget') || err.message);
      },
    });
  }
}
