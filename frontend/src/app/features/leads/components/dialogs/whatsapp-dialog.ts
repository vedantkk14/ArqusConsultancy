import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../../core/models';
import { WhatsAppTemplate } from '../../data/lead.models';
import { LeadsApi } from '../../data/leads-api.service';
import { normalizePhone } from '../../utils/phone';

export interface WhatsAppDialogData {
  lead: { id: number; name: string; phone: string };
}

/** Choose a template, see the message the server renders, then open WhatsApp (logged on the timeline). */
@Component({
  selector: 'app-whatsapp-dialog',
  imports: [MatButtonModule, MatDialogModule],
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
      min-height: 96px; margin: 0; padding: 12px 14px; border-radius: 12px 12px 12px 4px;
      background: var(--tint-teal); color: var(--tint-teal-ink); white-space: pre-wrap; font-size: var(--text-sm);
    }
  `,
  template: `
    <h2 mat-dialog-title>WhatsApp {{ data.lead.name }}</h2>
    <p class="sub">Pick a message. It opens in WhatsApp for you to send.</p>
    <div class="tpls" role="group" aria-label="Templates">
      @for (t of templates(); track t.id) {
        <button type="button" class="tpl" [attr.aria-pressed]="choice() === t.id" (click)="pick(t.id)">{{ t.name }}</button>
      }
    </div>
    <p class="preview" aria-live="polite">{{ preview() || 'Choose a template to preview the message.' }}</p>
    @if (!usable) {
      <p class="error">This phone number can't be used for WhatsApp. Fix it on the lead first.</p>
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
        [attr.aria-label]="usable ? 'Open WhatsApp for ' + data.lead.name : 'Open WhatsApp (phone number unusable)'"
        (click)="open()"
      >
        Open WhatsApp
      </button>
    </div>
  `,
})
export class WhatsAppDialog {
  protected readonly data = inject<WhatsAppDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<WhatsAppDialog, boolean>);
  private readonly api = inject(LeadsApi);

  protected readonly usable = normalizePhone(this.data.lead.phone) !== null;
  protected readonly templates = signal<WhatsAppTemplate[]>([]);
  protected readonly choice = signal<number | null>(null);
  protected readonly preview = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.api.templates().subscribe((list) => {
      this.templates.set(list);
      if (list.length) {
        this.pick(list[0].id);
      }
    });
  }

  protected pick(id: number): void {
    this.choice.set(id);
    this.api.whatsappPreview(this.data.lead.id, id).subscribe({
      next: (res) => this.preview.set(res.text),
      error: (err: ApiError) => this.error.set(err.message),
    });
  }

  protected open(): void {
    const id = this.choice();
    if (!id) {
      return;
    }
    // Open the tab synchronously (popup blockers), then point it at the server's wa.me link.
    const tab = window.open('', '_blank');
    this.sending.set(true);
    this.api.whatsapp(this.data.lead.id, id).subscribe({
      next: (res) => {
        if (tab) {
          tab.opener = null;
          tab.location.href = res.url;
        } else {
          window.open(res.url, '_blank', 'noopener');
        }
        this.ref.close(true);
      },
      error: (err: ApiError) => {
        tab?.close();
        this.sending.set(false);
        this.error.set(err.message);
      },
    });
  }
}
