import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/models';
import { DialogHead } from '../../leads/components/dialogs/dialog-head';
import { LeadsApi } from '../../leads/data/leads-api.service';

export type TemplateKind = 'whatsapp-templates' | 'email-templates' | 'call-scripts';

export interface EditTemplateData {
  kind: TemplateKind;
  /** Omitted when adding a new one. */
  template?: { id: number; name: string; body: string; subject?: string };
}

export interface EditedTemplate {
  id: number;
  name: string;
  body: string;
  subject?: string;
}

/** Add or reword a template or call script with quick-insert tags and live client preview. */
@Component({
  selector: 'app-edit-template-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../leads/components/dialogs/dialog.scss',
  styles: `
    :host {
      width: min(540px, calc(100vw - 32px)) !important;
    }
    .field-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .label-hint {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .guide-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--subtle);
      border: 1px solid var(--line);
      border-radius: var(--radius-control);
      margin-bottom: 8px;
      font-size: var(--text-xs);
      color: var(--ink-2);
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }
    }
    .step-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 500;
      white-space: nowrap;
    }
    .step-pill.active {
      color: var(--brand-deep);
      font-weight: 600;
    }
    .step-pill .num {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--line-strong);
      color: var(--ink);
      font-size: 10px;
      display: grid;
      place-items: center;
      font-weight: 700;
    }
    .step-pill.active .num {
      background: var(--brand-deep);
      color: #fff;
    }
    .guide-banner .arrow {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: var(--ink-3);
      flex-shrink: 0;
    }
    .tags-container {
      margin-bottom: 8px;
    }
    .tags-label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--ink-2);
      margin-bottom: 6px;
    }
    .tags-label mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: var(--brand-deep);
    }
    .tags-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 10px;
      border-radius: var(--radius-control);
      border: 1px solid;
      font: inherit;
      font-size: var(--text-xs);
      font-weight: 600;
      cursor: pointer;
      transition: all var(--dur-fast, 150ms) ease;
    }
    .tag-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
    .tag-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
    }
    .tag-btn:active {
      transform: translateY(0);
    }
    .tag-lead {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
    }
    .tag-lead:hover {
      background: #dbeafe;
    }
    .tag-exec {
      background: #f5f3ff;
      border-color: #ddd6fe;
      color: #6d28d9;
    }
    .tag-exec:hover {
      background: #ede9fe;
    }
    .tag-company {
      background: #ecfdf5;
      border-color: #a7f3d0;
      color: #047857;
    }
    .tag-company:hover {
      background: #d1fae5;
    }
    .starters-container {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }
    .starters-label {
      font-size: var(--text-xs);
      color: var(--ink-3);
    }
    .starter-chip {
      padding: 3px 8px;
      border: 1px dashed var(--line-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--ink-2);
      font: inherit;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--dur-fast, 150ms) ease;
    }
    .starter-chip:hover {
      background: var(--subtle);
      border-style: solid;
      color: var(--brand-deep);
    }
    .preview-card {
      margin-top: -6px;
      margin-bottom: var(--space-4);
      padding: 10px 12px;
      background: var(--subtle);
      border: 1px solid var(--line);
      border-radius: var(--radius-control);
    }
    .preview-header {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: var(--text-xs);
      color: var(--ink-2);
      margin-bottom: 6px;
    }
    .preview-header mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
      color: var(--brand-deep);
    }
    .preview-badge {
      margin-left: auto;
      padding: 1px 6px;
      border-radius: var(--radius-pill);
      background: var(--brand-tint);
      color: var(--brand-deep);
      font-size: 10px;
      font-weight: 600;
    }
    .preview-bubble {
      padding: 8px 10px;
      border-radius: 6px;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      color: var(--ink);
      font-size: var(--text-xs);
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `,
  template: `
    <app-dialog-head
      [title]="title"
      subtitle="Click quick tags below to insert client name, your name, and company automatically."
    />
    <form (ngSubmit)="save()" novalidate>
      <div class="field">
        <label for="et-name">Template Name</label>
        <input
          id="et-name"
          type="text"
          name="name"
          maxlength="100"
          placeholder="e.g. Initial Introduction, Quotation Follow-up"
          [(ngModel)]="name"
        />
      </div>

      @if (data.kind === 'email-templates') {
        <div class="field">
          <label for="et-subject">Subject</label>
          <input
            id="et-subject"
            type="text"
            name="subject"
            placeholder="e.g. Update regarding your inquiry with {{ '{{company}}' }}"
            [(ngModel)]="subject"
            (focus)="activeField = 'subject'"
          />
        </div>
      }

      <div class="field">
        <div class="field-label-row">
          <label for="et-body">Message</label>
          <span class="label-hint">Click tags below to insert info</span>
        </div>

        <!-- 3-step guide -->
        <div class="guide-banner" aria-label="Steps to create template">
          <div class="step-pill"><span class="num">1</span> Type text</div>
          <mat-icon class="arrow" aria-hidden="true">arrow_forward</mat-icon>
          <div class="step-pill active"><span class="num">2</span> Click tag to insert</div>
          <mat-icon class="arrow" aria-hidden="true">arrow_forward</mat-icon>
          <div class="step-pill"><span class="num">3</span> Save</div>
        </div>

        <!-- Quick insert tags -->
        <div class="tags-container">
          <div class="tags-label">
            <mat-icon aria-hidden="true">touch_app</mat-icon> Click to insert anywhere in message:
          </div>
          <div class="tags-buttons" role="group" aria-label="Quick insert tags">
            <button
              type="button"
              class="tag-btn tag-lead"
              (click)="insertTag('{{lead_name}}')"
              title="Inserts Client / Lead Name placeholder"
              aria-label="Insert Lead Name"
            >
              <mat-icon aria-hidden="true">person</mat-icon>
              <span>+ Lead Name</span>
            </button>

            <button
              type="button"
              class="tag-btn tag-exec"
              (click)="insertTag('{{exec_name}}')"
              title="Inserts Sales Executive Name placeholder"
              aria-label="Insert My Name"
            >
              <mat-icon aria-hidden="true">badge</mat-icon>
              <span>+ My Name (Sales Exe)</span>
            </button>

            <button
              type="button"
              class="tag-btn tag-company"
              (click)="insertTag('{{company}}')"
              title="Inserts Company Name placeholder"
              aria-label="Insert Company Name"
            >
              <mat-icon aria-hidden="true">business</mat-icon>
              <span>+ Company Name</span>
            </button>
          </div>
        </div>

        <!-- Quick Starters -->
        <div class="starters-container">
          <span class="starters-label">Need a quick start?</span>
          <button type="button" class="starter-chip" (click)="useStarter('intro')">
            Greeting & Intro
          </button>
          <button type="button" class="starter-chip" (click)="useStarter('followup')">
            Follow-up
          </button>
          <button type="button" class="starter-chip" (click)="useStarter('call')">
            Call Request
          </button>
        </div>

        <textarea
          id="et-body"
          name="body"
          rows="6"
          placeholder="Type message here. Click '+ Lead Name', '+ My Name', or '+ Company Name' to insert client or sender details automatically."
          [(ngModel)]="body"
          (focus)="activeField = 'body'"
        ></textarea>
      </div>

      @if (body.trim()) {
        <div class="preview-card">
          <div class="preview-header">
            <mat-icon aria-hidden="true">visibility</mat-icon>
            <strong>Client View Preview</strong>
            <span class="preview-badge">Live</span>
          </div>
          <div class="preview-bubble">{{ previewText() }}</div>
        </div>
      }

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
  private readonly auth = inject(AuthService, { optional: true });

  protected readonly title = this.data.template
    ? 'Edit template'
    : this.data.kind === 'call-scripts'
      ? 'New call script'
      : 'New template';
  protected name = this.data.template?.name ?? '';
  protected subject = this.data.template?.subject ?? '';
  protected body = this.data.template?.body ?? '';
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected activeField: 'body' | 'subject' = 'body';

  protected insertTag(tag: string): void {
    const isSubject = this.activeField === 'subject' && this.data.kind === 'email-templates';
    const elementId = isSubject ? 'et-subject' : 'et-body';
    const element = document.getElementById(elementId) as HTMLInputElement | HTMLTextAreaElement | null;

    if (isSubject) {
      if (element) {
        const start = element.selectionStart ?? this.subject.length;
        const end = element.selectionEnd ?? this.subject.length;
        const text = this.subject;
        this.subject = text.substring(0, start) + tag + text.substring(end);
        setTimeout(() => {
          element.focus();
          element.setSelectionRange(start + tag.length, start + tag.length);
        });
      } else {
        this.subject += (this.subject ? ' ' : '') + tag;
      }
    } else {
      if (element) {
        const start = element.selectionStart ?? this.body.length;
        const end = element.selectionEnd ?? this.body.length;
        const text = this.body;
        this.body = text.substring(0, start) + tag + text.substring(end);
        setTimeout(() => {
          element.focus();
          element.setSelectionRange(start + tag.length, start + tag.length);
        });
      } else {
        this.body += (this.body ? ' ' : '') + tag;
      }
    }
  }

  protected useStarter(type: 'intro' | 'followup' | 'call'): void {
    if (type === 'intro') {
      if (!this.name.trim()) this.name = 'Greeting & Intro';
      if (this.data.kind === 'email-templates' && !this.subject.trim()) {
        this.subject = 'Introduction from {{company}}';
      }
      this.body =
        'Hi {{lead_name}},\n\nThis is {{exec_name}} from {{company}}. Thank you for connecting with us! When would be a good time to discuss your sports infrastructure requirements?';
    } else if (type === 'followup') {
      if (!this.name.trim()) this.name = 'Quick Follow-up';
      if (this.data.kind === 'email-templates' && !this.subject.trim()) {
        this.subject = 'Follow-up regarding your project with {{company}}';
      }
      this.body =
        'Hi {{lead_name}},\n\nJust following up on our previous conversation regarding your inquiry with {{company}}. Please let me know if you need any additional info or quotes.\n\nRegards,\n{{exec_name}}';
    } else if (type === 'call') {
      if (!this.name.trim()) this.name = 'Schedule Call';
      if (this.data.kind === 'email-templates' && !this.subject.trim()) {
        this.subject = 'Quick 5-minute call — {{company}}';
      }
      this.body =
        'Hi {{lead_name}},\n\n{{exec_name}} from {{company}} here. Could we schedule a quick 5-minute call today to review the project details? Let me know what time works best for you.';
    }
    setTimeout(() => {
      document.getElementById('et-body')?.focus();
    });
  }

  protected previewText(): string {
    const sender = this.auth?.user()?.name || 'Your Name';
    return this.body
      .replace(/\{\{lead_name\}\}/g, 'Rahul Sharma')
      .replace(/\{\{exec_name\}\}/g, sender)
      .replace(/\{\{company\}\}/g, 'ARQUS SPORTS CONSULTANCY');
  }

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
    const request = this.data.template
      ? this.api.updateTemplate<EditedTemplate>(this.data.kind, this.data.template.id, payload)
      : this.api.createTemplate<EditedTemplate>(this.data.kind, payload);
    request.subscribe({
      next: (saved) => this.ref.close(saved),
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
