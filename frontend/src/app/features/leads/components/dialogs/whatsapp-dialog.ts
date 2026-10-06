import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiError } from '../../../../core/models';
import { EmailTemplate, WhatsAppTemplate } from '../../data/lead.models';
import { LeadsApi } from '../../data/leads-api.service';
import { normalizePhone } from '../../utils/phone';
import { DialogHead } from './dialog-head';

type Channel = 'whatsapp' | 'email';

export interface WhatsAppDialogData {
  lead: { id: number; name: string; phone: string; email?: string };
}

/**
 * "Message <client>": pick WhatsApp or Email, choose a template, tweak the text, send.
 * WhatsApp opens wa.me; Email is queued in django-mailer and sent from ARQUS. Both are logged on the timeline.
 */
@Component({
  selector: 'app-whatsapp-dialog',
  imports: [DialogHead, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  styles: `
    .channels { display: inline-flex; gap: 4px; margin-bottom: var(--space-4); padding: 4px; border-radius: var(--radius-pill); background: var(--line); }
    .ch {
      min-height: 36px; padding: 0 16px; border: 0; border-radius: var(--radius-pill); background: transparent;
      color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    .ch[aria-pressed='true'] { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }
    .ch:disabled { opacity: 0.45; cursor: not-allowed; }
    .ch.muted { opacity: 0.6; }
    .subject { margin: 0 0 6px; color: var(--ink); font-size: var(--text-sm); font-weight: 600; }
    .tpls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: var(--space-4); }
    .tpl {
      min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-pill);
      background: var(--surface); color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    .tpl[aria-pressed='true'] { border-color: var(--brand-deep); background: var(--brand-tint); color: var(--ink); font-weight: 600; }
    .preview {
      display: block; box-sizing: border-box; width: 100%; min-height: 120px; margin: 0; padding: 12px 14px;
      border: 1px solid transparent; border-radius: 12px 12px 12px 4px; resize: vertical;
      background: var(--tint-teal); color: var(--tint-teal-ink); font: inherit; font-size: var(--text-sm); line-height: 1.5;
    }
    .preview:focus { border-color: var(--brand-deep); outline: none; }
    .hint { margin: 6px 2px 0; color: var(--ink-3); font-size: var(--text-xs); }
  `,
  template: `
    <app-dialog-head
      [title]="'Message ' + data.lead.name"
      [subtitle]="
        channel() === 'whatsapp'
          ? 'Pick a message. It opens in WhatsApp for you to send.'
          : 'Pick an email. It is sent to the lead from ARQUS, and replies come to you.'
      "
    />
    <div class="channels" role="group" aria-label="Send by">
      <button type="button" class="ch" [attr.aria-pressed]="channel() === 'whatsapp'" [disabled]="!phoneOk" (click)="setChannel('whatsapp')">WhatsApp</button>
      <button
        type="button"
        class="ch"
        [class.muted]="!emailOk"
        [attr.aria-pressed]="channel() === 'email'"
        [attr.title]="emailOk ? null : 'This lead has no email address yet'"
        (click)="setChannel('email')"
      >Email</button>
    </div>
    <div class="tpls" role="group" aria-label="Templates">
      @for (t of list(); track t.id) {
        <button type="button" class="tpl" [attr.aria-pressed]="choice() === t.id" (click)="pick(t.id)">{{ t.name }}</button>
      }
    </div>
    @if (channel() === 'email' && subject()) {
      <p class="subject">{{ subject() }}</p>
    }
    <textarea
      class="preview"
      [attr.aria-label]="channel() === 'whatsapp' ? 'Message to send' : 'Email to send'"
      placeholder="Choose a template to preview the message."
      [value]="preview()"
      (input)="edit($event)"
    ></textarea>
    <p class="hint">You can change the message here before {{ channel() === 'whatsapp' ? 'opening WhatsApp' : 'sending' }}.</p>
    @if (!phoneOk && !emailOk) {
      <p class="error">This lead has no usable phone number or email address. Fix it on the lead first.</p>
    } @else if (channel() === 'whatsapp' && !phoneOk) {
      <p class="error">This phone number can't be used for WhatsApp. Fix it on the lead first.</p>
    } @else if (channel() === 'email' && !emailOk) {
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
        [disabled]="!usable() || !choice() || !preview().trim() || sending()"
        [attr.aria-label]="(channel() === 'whatsapp' ? 'Open WhatsApp for ' : 'Send email to ') + data.lead.name"
        (click)="send()"
      >
        {{ channel() === 'whatsapp' ? 'Open WhatsApp' : 'Send Email' }}
      </button>
    </div>
  `,
})
export class WhatsAppDialog {
  protected readonly data = inject<WhatsAppDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<WhatsAppDialog, boolean>);
  private readonly api = inject(LeadsApi);
  private readonly snack = inject(MatSnackBar);

  protected readonly phoneOk = normalizePhone(this.data.lead.phone) !== null;
  protected readonly emailOk = !!this.data.lead.email;
  protected readonly channel = signal<Channel>(this.phoneOk || !this.emailOk ? 'whatsapp' : 'email');
  protected readonly usable = computed(() => (this.channel() === 'whatsapp' ? this.phoneOk : this.emailOk));
  private readonly waTemplates = signal<WhatsAppTemplate[]>([]);
  private readonly mailTemplates = signal<EmailTemplate[]>([]);
  protected readonly list = computed<{ id: number; name: string }[]>(() =>
    this.channel() === 'whatsapp' ? this.waTemplates() : this.mailTemplates(),
  );
  protected readonly choice = signal<number | null>(null);
  protected readonly subject = signal('');
  protected readonly preview = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal('');
  private original = '';

  constructor() {
    this.api.templates().subscribe((tpls) => {
      this.waTemplates.set(tpls);
      this.firstTemplate('whatsapp');
    });
    this.api.emailTemplates().subscribe((tpls) => {
      this.mailTemplates.set(tpls);
      this.firstTemplate('email');
    });
  }

  private firstTemplate(channel: Channel): void {
    if (this.channel() === channel && this.list().length && this.choice() === null) {
      this.pick(this.list()[0].id);
    }
  }

  protected setChannel(channel: Channel): void {
    if (channel === this.channel()) {
      return;
    }
    this.channel.set(channel);
    this.choice.set(null);
    this.subject.set('');
    this.preview.set('');
    this.original = '';
    this.error.set('');
    this.firstTemplate(channel);
  }

  protected pick(id: number): void {
    this.choice.set(id);
    this.error.set('');
    if (!this.usable()) {
      return;
    }
    const channel = this.channel();
    const done = (text: string, subject = '') => {
      if (this.channel() !== channel || this.choice() !== id) {
        return; // the user moved on while this was loading
      }
      this.preview.set(text);
      this.subject.set(subject);
      this.original = text;
    };
    if (channel === 'whatsapp') {
      this.api.whatsappPreview(this.data.lead.id, id).subscribe({
        next: (res) => done(res.text),
        error: (err: ApiError) => this.error.set(err.message),
      });
    } else {
      this.api.emailPreview(this.data.lead.id, id).subscribe({
        next: (res) => done(res.text, res.subject),
        error: (err: ApiError) => this.error.set(err.message),
      });
    }
  }

  protected edit(event: Event): void {
    this.preview.set((event.target as HTMLTextAreaElement).value);
  }

  protected send(): void {
    const id = this.choice();
    if (!id) {
      return;
    }
    const text = this.preview().trim();
    // Only send the sender's wording when it differs from the rendered template.
    const edited = text && text !== this.original.trim() ? text : undefined;
    if (this.channel() === 'email') {
      this.sending.set(true);
      this.api.email(this.data.lead.id, id, edited).subscribe({
        next: () => {
          this.snack.open(`Email sent to ${this.data.lead.name}.`, undefined, { duration: 4000 });
          this.ref.close(true);
        },
        error: (err: ApiError) => {
          this.sending.set(false);
          this.error.set(err.message);
        },
      });
      return;
    }
    // Open the tab synchronously (popup blockers), then point it at the server's wa.me link.
    const tab = window.open('', '_blank');
    this.sending.set(true);
    this.api.whatsapp(this.data.lead.id, id, edited).subscribe({
      next: (res) => {
        if (tab) {
          tab.opener = null;
          tab.location.href = res.url;
        } else {
          window.open(res.url, '_blank', 'noopener');
        }
        this.snack.open(
          `WhatsApp opened for ${this.data.lead.name}. Press Send there to deliver it.`,
          undefined,
          { duration: 5000 },
        );
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
