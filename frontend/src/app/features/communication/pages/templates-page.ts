import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { PaginatedResponse } from '../../../core/models';
import { CallDialog, CallDialogData } from '../../leads/components/dialogs/call-dialog';
import { EmailDialog, EmailDialogData } from '../../leads/components/dialogs/email-dialog';
import { WhatsAppDialog, WhatsAppDialogData } from '../../leads/components/dialogs/whatsapp-dialog';
import { CallScript, EmailTemplate, LeadListItem, WhatsAppTemplate } from '../../leads/data/lead.models';
import { LeadsApi } from '../../leads/data/leads-api.service';
import { PanelHead } from '../../dashboard/components/panel-head';
import { EmptyState } from '../../../shared/empty-state/empty-state';

const EMPTY_PAGE: PaginatedResponse<LeadListItem> = { count: 0, next: null, previous: null, results: [] };

/** Browse the message templates and call scripts, then send a quick message to any lead. */
@Component({
  selector: 'app-templates-page',
  imports: [EmptyState, MatButtonModule, MatIconModule, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .card { padding: var(--space-5); margin-bottom: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
    .search {
      display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px;
      border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: var(--surface);
    }
    .search input { flex: 1; border: 0; background: transparent; color: var(--ink); font: inherit; outline: none; }
    .search mat-icon { color: var(--ink-3); }
    .results { margin: var(--space-3) 0 0; padding: 0; list-style: none; }
    .results li {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 10px 4px; border-bottom: 1px solid var(--line);
    }
    .results li:last-child { border-bottom: 0; }
    .who { min-width: 0; }
    .nm { margin: 0; color: var(--ink); font-size: var(--text-sm); font-weight: 600; }
    .ph { margin: 0; color: var(--ink-3); font-size: var(--text-xs); }
    .btns { display: flex; flex: none; gap: 6px; }
    .tpls { display: flex; flex-direction: column; gap: 10px; }
    .tpl { padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-control); }
    .tpl .h { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .tpl .h strong { font-size: var(--text-sm); }
    .tpl .h span { color: var(--ink-3); font-size: var(--text-xs); }
    .tpl p { margin: 0; color: var(--ink-2); font-size: var(--text-sm); white-space: pre-wrap; }
    .tabs { display: flex; gap: 8px; margin-bottom: var(--space-4); }
    .tab {
      min-height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-pill);
      background: var(--surface); color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    .tab[aria-pressed='true'] { border-color: var(--brand-deep); background: var(--brand-tint); color: var(--ink); font-weight: 600; }
  `,
  template: `
    <section class="card">
      <app-panel-head title="Quick message" subtitle="Find a lead and send a WhatsApp or email using a template." />
      <div class="search">
        <mat-icon aria-hidden="true">search</mat-icon>
        <input type="text" placeholder="Search leads by name or phone…" [value]="query()" (input)="onQuery($event)" aria-label="Search leads" />
      </div>
      @if (results().length) {
        <ul class="results">
          @for (lead of results(); track lead.id) {
            <li>
              <div class="who">
                <p class="nm">{{ lead.name }}</p>
                <p class="ph">{{ lead.phone }}</p>
              </div>
              <div class="btns">
                <button matButton="outlined" type="button" (click)="call(lead)" [attr.aria-label]="'Call ' + lead.name">
                  <mat-icon>call</mat-icon>
                </button>
                <button matButton="outlined" type="button" (click)="whatsapp(lead)" [attr.aria-label]="'WhatsApp ' + lead.name">
                  <mat-icon>chat</mat-icon>
                </button>
                @if (lead.email) {
                  <button matButton="outlined" type="button" (click)="email(lead)" [attr.aria-label]="'Email ' + lead.name">
                    <mat-icon>mail</mat-icon>
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      } @else if (query().length > 1) {
        <p class="ph" style="margin-top: var(--space-3);">No leads match "{{ query() }}".</p>
      }
    </section>

    <section class="card">
      <app-panel-head title="Templates" subtitle="Active messages available to send." />
      <div class="tabs" role="tablist">
        <button type="button" class="tab" [attr.aria-pressed]="tab() === 'whatsapp'" (click)="tab.set('whatsapp')">WhatsApp</button>
        <button type="button" class="tab" [attr.aria-pressed]="tab() === 'email'" (click)="tab.set('email')">Email</button>
        <button type="button" class="tab" [attr.aria-pressed]="tab() === 'call'" (click)="tab.set('call')">Call scripts</button>
      </div>
      @if (tab() === 'whatsapp') {
        <div class="tpls">
          @for (t of waTemplates(); track t.id) {
            <div class="tpl"><div class="h"><strong>{{ t.name }}</strong></div><p>{{ t.body }}</p></div>
          } @empty {
            <app-empty-state icon="chat" title="No WhatsApp templates yet" message="Add one from the admin site." [bordered]="false" />
          }
        </div>
      } @else if (tab() === 'email') {
        <div class="tpls">
          @for (t of emailTemplates(); track t.id) {
            <div class="tpl"><div class="h"><strong>{{ t.name }}</strong><span>{{ t.subject }}</span></div><p>{{ t.body }}</p></div>
          } @empty {
            <app-empty-state icon="mail" title="No email templates yet" message="Add one from the admin site." [bordered]="false" />
          }
        </div>
      } @else {
        <div class="tpls">
          @for (s of callScripts(); track s.id) {
            <div class="tpl"><div class="h"><strong>{{ s.name }}</strong></div><p>{{ s.body }}</p></div>
          } @empty {
            <app-empty-state icon="call" title="No call scripts yet" message="Add one from the admin site." [bordered]="false" />
          }
        </div>
      }
    </section>
  `,
})
export class TemplatesPage {
  private readonly api = inject(LeadsApi);
  private readonly dialog = inject(MatDialog);

  protected readonly tab = signal<'whatsapp' | 'email' | 'call'>('whatsapp');
  protected readonly waTemplates = signal<WhatsAppTemplate[]>([]);
  protected readonly emailTemplates = signal<EmailTemplate[]>([]);
  protected readonly callScripts = signal<CallScript[]>([]);

  protected readonly query = signal('');
  protected readonly results = signal<LeadListItem[]>([]);
  private readonly search$ = new Subject<string>();

  constructor() {
    this.api.templates().subscribe((list) => this.waTemplates.set(list));
    this.api.emailTemplates().subscribe((list) => this.emailTemplates.set(list));
    this.api.callScripts().subscribe((list) => this.callScripts.set(list));

    this.search$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => (q.trim().length > 1 ? this.api.list({ q: q.trim(), page_size: 8 }) : of(EMPTY_PAGE))),
      )
      .subscribe((res) => this.results.set(res.results));
  }

  protected onQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.search$.next(value);
    if (value.trim().length <= 1) {
      this.results.set([]);
    }
  }

  protected call(lead: LeadListItem): void {
    this.dialog.open<CallDialog, CallDialogData, boolean>(CallDialog, { data: { lead } });
  }

  protected whatsapp(lead: LeadListItem): void {
    this.dialog.open<WhatsAppDialog, WhatsAppDialogData, boolean>(WhatsAppDialog, { data: { lead } });
  }

  protected email(lead: LeadListItem): void {
    this.dialog.open<EmailDialog, EmailDialogData, boolean>(EmailDialog, { data: { lead } });
  }
}
