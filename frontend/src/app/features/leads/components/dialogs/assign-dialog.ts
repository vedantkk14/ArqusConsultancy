import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { ApiError } from '../../../../core/models';
import { Assignee } from '../../data/lead.models';
import { LeadsApi } from '../../data/leads-api.service';
import { LeadAvatar } from '../lead-bits';

export interface AssignDialogData {
  ids: number[];
  /** "Rahul Sharma" for one lead, "12 leads" for bulk. */
  label: string;
  currentId?: number | null;
}

/** Pick a sales executive (with their open-lead count) for one lead or a selection. */
@Component({
  selector: 'app-assign-dialog',
  imports: [LeadAvatar, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  styles: `
    ul { display: flex; flex-direction: column; gap: 4px; max-height: 320px; margin: 0; padding: 0; overflow: auto; list-style: none; }
    label.opt {
      display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 6px 10px;
      border: 1px solid var(--line); border-radius: var(--radius-control); cursor: pointer;
    }
    label.opt:has(input:checked) { border-color: var(--brand-deep); background: var(--brand-tint); }
    .nm { flex: 1; color: var(--ink); font-weight: 500; }
    .ct { color: var(--ink-3); font-size: var(--text-sm); }
    input[type='radio'] { width: 18px; height: 18px; accent-color: var(--brand-deep); }
  `,
  template: `
    <h2 mat-dialog-title>Assign to…</h2>
    <p class="sub">{{ data.label }}</p>
    @if (assignees(); as list) {
      <fieldset style="border:0;margin:0;padding:0">
        <legend class="sr-only">Sales executive</legend>
        <ul>
          @for (a of list; track a.id) {
            <li>
              <label class="opt">
                <input type="radio" name="assignee" [value]="a.id" [checked]="choice() === a.id" (change)="choice.set(a.id)" />
                <app-lead-avatar [name]="a.name" [size]="32" />
                <span class="nm">{{ a.name }}</span>
                <span class="ct">{{ a.open_count }} open</span>
              </label>
            </li>
          } @empty {
            <li class="sub">No active sales executives.</li>
          }
        </ul>
      </fieldset>
    } @else {
      <p class="sub">Loading executives…</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="actions">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" [disabled]="!choice() || saving()" (click)="save()">
        {{ saving() ? 'Assigning…' : 'Assign' }}
      </button>
    </div>
  `,
})
export class AssignDialog {
  protected readonly data = inject<AssignDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AssignDialog, boolean>);
  private readonly api = inject(LeadsApi);

  protected readonly assignees = signal<Assignee[] | null>(null);
  protected readonly choice = signal<number | null>(this.data.currentId ?? null);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.api.assignees().subscribe({
      next: (list) => this.assignees.set(list),
      error: (err: ApiError) => {
        this.assignees.set([]);
        this.error.set(err.message);
      },
    });
  }

  protected save(): void {
    const to = this.choice();
    if (!to) {
      return;
    }
    this.saving.set(true);
    const request: Observable<unknown> =
      this.data.ids.length === 1 ? this.api.assign(this.data.ids[0], to) : this.api.bulkAssign(this.data.ids, to);
    request.subscribe({
      next: () => this.ref.close(true),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
