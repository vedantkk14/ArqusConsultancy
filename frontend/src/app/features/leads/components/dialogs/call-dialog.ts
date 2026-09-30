import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { CallScript } from '../../data/lead.models';
import { LeadsApi } from '../../data/leads-api.service';
import { toTelHref } from '../../utils/phone';
import { DialogHead } from './dialog-head';

export interface CallDialogData {
  lead: { id: number; name: string; phone: string };
}

/** Pick a script to reference, dial the lead, then log the call on the timeline. */
@Component({
  selector: 'app-call-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  styles: `
    .tpls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: var(--space-4); }
    .tpl {
      min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-pill);
      background: var(--surface); color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    .tpl[aria-pressed='true'] { border-color: var(--brand-deep); background: var(--brand-tint); color: var(--ink); font-weight: 600; }
    .preview {
      min-height: 72px; margin: 0 0 var(--space-4); padding: 12px 14px; border-radius: 12px 12px 12px 4px;
      background: var(--tint-amber); color: var(--tint-amber-ink); white-space: pre-wrap; font-size: var(--text-sm);
    }
  `,
  template: `
    <app-dialog-head [title]="'Call ' + data.lead.name" subtitle="Pick a script to reference, call, then log the outcome." />
    <div class="tpls" role="group" aria-label="Call scripts">
      @for (s of scripts(); track s.id) {
        <button type="button" class="tpl" [attr.aria-pressed]="choice() === s.id" (click)="pick(s.id)">{{ s.name }}</button>
      }
      <button type="button" class="tpl" [attr.aria-pressed]="choice() === null" (click)="pick(null)">No script</button>
    </div>
    @if (choice() !== null) {
      <p class="preview">{{ scriptBody() }}</p>
    }
    @if (tel) {
      <a matButton="outlined" [href]="tel" style="margin-bottom: var(--space-4); display: inline-flex;">Dial {{ data.lead.name }}</a>
    }
    <div class="field">
      <label for="cd-notes">Outcome (optional)</label>
      <textarea id="cd-notes" name="notes" [(ngModel)]="notes"></textarea>
    </div>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="actions">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="button" [disabled]="saving()" (click)="log()">
        {{ saving() ? 'Logging…' : 'Log call' }}
      </button>
    </div>
  `,
})
export class CallDialog {
  protected readonly data = inject<CallDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CallDialog, boolean>);
  private readonly api = inject(LeadsApi);

  protected readonly tel = toTelHref(this.data.lead.phone);
  protected readonly scripts = signal<CallScript[]>([]);
  protected readonly choice = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected notes = '';

  constructor() {
    this.api.callScripts().subscribe((list) => this.scripts.set(list));
  }

  protected scriptBody(): string {
    return this.scripts().find((s) => s.id === this.choice())?.body ?? '';
  }

  protected pick(id: number | null): void {
    this.choice.set(id);
  }

  protected log(): void {
    this.saving.set(true);
    this.error.set('');
    this.api.logCall(this.data.lead.id, { script_id: this.choice(), notes: this.notes.trim() }).subscribe({
      next: () => this.ref.close(true),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
