import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { Assignee, NewOpportunity, Opportunity } from '../../data/lead.models';
import { LeadsApi } from '../../data/leads-api.service';
import { toBusinessIso } from '../../utils/business-time';
import { LeadAvatar } from '../lead-bits';
import { FollowupPicker } from '../followup-picker';
import { DialogHead } from './dialog-head';

export interface NewDealDialogData {
  leadId: number;
  /** "Badagu textiles" */
  name: string;
  /** The lead's current assignee, pre-selected. */
  assignedToId: number | null;
}

/** Admin/Sales Manager: start a fresh deal with an existing client - requirements, who owns it, and
 * when to follow up. Everything is optional; leaving assignment blank keeps the lead's current owner. */
@Component({
  selector: 'app-new-deal-dialog',
  imports: [DialogHead, FollowupPicker, FormsModule, LeadAvatar, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  styles: `
    .lbl-block { display: block; margin-bottom: 6px; color: var(--ink-2); font-size: var(--text-sm); font-weight: 500; }
    .opt-lbl { color: var(--ink-3); font-weight: 400; }
    .hint { margin: 0; color: var(--ink-3); font-size: var(--text-sm); }
    ul { display: flex; flex-direction: column; gap: 4px; max-height: 220px; margin: 0; padding: 0; overflow: auto; list-style: none; }
    label.opt {
      display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 4px 10px;
      border: 1px solid var(--line); border-radius: var(--radius-control); cursor: pointer;
    }
    label.opt:has(input:checked) { border-color: var(--brand-deep); background: var(--brand-tint); }
    .nm { flex: 1; color: var(--ink); font-size: var(--text-sm); font-weight: 500; }
    input[type='radio'] { width: 16px; height: 16px; accent-color: var(--brand-deep); }
  `,
  template: `
    <app-dialog-head title="New project" [subtitle]="data.name" />
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="nd-req">Requirements <span class="opt-lbl">(optional)</span></label>
        <textarea id="nd-req" name="requirements" maxlength="500" [(ngModel)]="requirements" placeholder="What does this deal cover?"></textarea>
      </div>

      <div class="field">
        <span class="lbl-block">Assign to <span class="opt-lbl">(optional - keeps the current owner)</span></span>
        @if (assignees(); as list) {
          <fieldset style="border:0;margin:0;padding:0">
            <legend class="sr-only">Assign to</legend>
            <ul>
              @for (a of list; track a.id) {
                <li>
                  <label class="opt">
                    <input type="radio" name="assignee" [value]="a.id" [checked]="choice() === a.id" (change)="choice.set(a.id)" />
                    <app-lead-avatar [name]="a.name" [size]="28" />
                    <span class="nm">{{ a.name }}</span>
                  </label>
                </li>
              }
            </ul>
          </fieldset>
        } @else {
          <p class="hint">Loading team…</p>
        }
      </div>

      <div class="field">
        <label for="nd-fu">Follow up <span class="opt-lbl">(optional)</span></label>
        <app-followup-picker inputId="nd-fu" name="followup" [(ngModel)]="followup" />
      </div>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" (click)="ref.close()">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Starting…' : 'Start deal' }}</button>
      </div>
    </form>
  `,
})
export class NewDealDialog {
  protected readonly data = inject<NewDealDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<NewDealDialog, Opportunity>);
  private readonly api = inject(LeadsApi);

  protected requirements = '';
  protected followup = '';
  protected choice = signal<number | null>(this.data.assignedToId);
  protected readonly assignees = signal<Assignee[] | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.api.assignees().subscribe({
      next: (list) => this.assignees.set(list),
      error: () => this.assignees.set([]),
    });
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const body: NewOpportunity = {
      requirements: this.requirements.trim(),
      assigned_to: this.choice(),
      next_followup_at: this.followup ? toBusinessIso(this.followup) : null,
    };
    this.api.startOpportunity(this.data.leadId, body).subscribe({
      next: (deal) => this.ref.close(deal),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
