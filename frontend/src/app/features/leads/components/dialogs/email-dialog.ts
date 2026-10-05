import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiError } from '../../../../core/models';
import { EmailTemplate } from '../../data/lead.models';
import { LeadsApi } from '../../data/leads-api.service';
import { DialogHead } from './dialog-head';

export interface EmailDialogData {
  lead: { id: number; name: string; email: string };
}

/** Choose a template, see the message the server renders, then send it by SMTP (logged on the timeline). */
@Component({
  selector: 'app-email-dialog',
  imports: [DialogHead, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  styles: `
    .tpls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: var(--space-4); }
    .tpl {
      min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-pill);
      background: var(--surface); color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    .tpl[aria-pressed='true'] { border-color: var(--brand-deep); background: var(--brand-tint); color: var(--ink); font-weight: 600; }
    .subject { margin: 0 0 6px; color: var(--ink); font-size: var(--text-sm); font-weight: 600; }
    .preview {
      min-height: 96px; margin: 0; padding: 12px 14px; border-radius: 12px 12px 12px 4px;
      background: var(--tint-teal); color: var(--tint-teal-ink); white-space: pre-wrap; font-size: var(--text-sm);
    }
  `,
  template: `
    <app-dialog-head [title]="'Email ' + data.lead.name" subtitle="Pick a template. It is sent to the lead from ARQUS, and replies come to you." />
    <div class="tpls" role="group" aria-label="Templates">
      @for (t of templates(); track t.id) {
        <button type="button" class="tpl" [attr.aria-pressed]="choice() === t.id" (click)="pick(t.id)">{{ t.name }}</button>
      }
    </div>
    @if (subject()) {
      <p class="subject">{{ subject() }}</p>
    }
    <p class="preview" aria-live="polite">{{ preview() || 'Choose a template to preview the message.' }}</p>
    @if (!usable) {
      <p class="error">This lead has no email address. Add one on the lead first.</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="actions">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button
        matButton="filled"
        type="button"
        [disabled]="!usable || !choice() || sending()"
        [attr.aria-label]="usable ? 'Send email to ' + data.lead.name : 'Send email (no email address)'"
        (click)="open()"
      >
        Send Email
      </button>
    </div>
  `,
})
export class EmailDialog {
  protected readonly data = inject<EmailDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EmailDialog, boolean>);
  private readonly api = inject(LeadsApi);
  private readonly snack = inject(MatSnackBar);

  protected readonly usable = !!this.data.lead.email;
  protected readonly templates = signal<EmailTemplate[]>([]);
  protected readonly choice = signal<number | null>(null);
  protected readonly subject = signal('');
  protected readonly preview = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.api.emailTemplates().subscribe((list) => {
      this.templates.set(list);
      if (list.length) {
        this.pick(list[0].id);
      }
    });
  }

  protected pick(id: number): void {
    this.choice.set(id);
    if (!this.usable) {
      return;
    }
    this.api.emailPreview(this.data.lead.id, id).subscribe({
      next: (res) => {
        this.subject.set(res.subject);
        this.preview.set(res.text);
      },
      error: (err: ApiError) => this.error.set(err.message),
    });
  }

  protected open(): void {
    const id = this.choice();
    if (!id) {
      return;
    }
    this.sending.set(true);
    this.api.email(this.data.lead.id, id).subscribe({
      next: () => {
        this.snack.open(`Email sent to ${this.data.lead.name}.`, undefined, { duration: 4000 });
        this.ref.close(true);
      },
      error: (err: ApiError) => {
        this.sending.set(false);
        this.error.set(err.message);
      },
    });
  }
}
