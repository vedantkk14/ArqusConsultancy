import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../core/models';
import { DialogHead } from '../../leads/components/dialogs/dialog-head';
import { LeadsApi } from '../../leads/data/leads-api.service';

export type TemplateKind = 'whatsapp-templates' | 'email-templates' | 'call-scripts';

export interface EditTemplateData {
  kind: TemplateKind;
  template: { id: number; name: string; body: string; subject?: string };
}

export interface EditedTemplate {
  id: number;
  name: string;
  body: string;
  subject?: string;
}

/** Reword a template or call script. Placeholders {{lead_name}}, {{exec_name}}, {{company}} are filled in when sent. */
@Component({
  selector: 'app-edit-template-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../leads/components/dialogs/dialog.scss',
  template: `
    <app-dialog-head title="Edit template" subtitle="Use {{ '{{lead_name}}' }}, {{ '{{exec_name}}' }} and {{ '{{company}}' }} as placeholders." />
    <form (ngSubmit)="save()" novalidate>
      <div class="field">
        <label for="et-name">Name</label>
        <input id="et-name" type="text" name="name" [(ngModel)]="name" />
      </div>
      @if (data.kind === 'email-templates') {
        <div class="field">
          <label for="et-subject">Subject</label>
          <input id="et-subject" type="text" name="subject" [(ngModel)]="subject" />
        </div>
      }
      <div class="field">
        <label for="et-body">Message</label>
        <textarea id="et-body" name="body" rows="6" [(ngModel)]="body"></textarea>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  `,
})
export class EditTemplateDialog {
  protected readonly data = inject<EditTemplateData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EditTemplateDialog, EditedTemplate>);
  private readonly api = inject(LeadsApi);

  protected name = this.data.template.name;
  protected subject = this.data.template.subject ?? '';
  protected body = this.data.template.body;
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected save(): void {
    if (!this.name.trim() || !this.body.trim() || (this.data.kind === 'email-templates' && !this.subject.trim())) {
      this.error.set('Fill in every field.');
      return;
    }
    const payload: Partial<EditedTemplate> = { name: this.name.trim(), body: this.body.trim() };
    if (this.data.kind === 'email-templates') {
      payload.subject = this.subject.trim();
    }
    this.saving.set(true);
    this.error.set('');
    this.api.updateTemplate<EditedTemplate>(this.data.kind, this.data.template.id, payload).subscribe({
      next: (saved) => this.ref.close(saved),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
