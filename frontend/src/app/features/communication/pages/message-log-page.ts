import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { formatBusinessFull, relativeLabel } from '../../leads/utils/business-time';
import { formatPhone } from '../../leads/utils/phone';
import { MessageLogEntry } from '../../leads/data/lead.models';
import { LeadsApi } from '../../leads/data/leads-api.service';
import { PanelHead } from '../../dashboard/components/panel-head';

const CHANNEL_META: Record<string, { icon: string; label: string; tint: string }> = {
  WHATSAPP: { icon: 'chat', label: 'WhatsApp', tint: 't-teal' },
  EMAIL: { icon: 'mail', label: 'Email', tint: 't-slate' },
};

/** Every WhatsApp/email message sent to any lead, newest first. Visible to the whole team. */
@Component({
  selector: 'app-message-log-page',
  imports: [EmptyState, ErrorState, MatIconModule, PanelHead, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .card { padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
    ol { margin: 0; padding: 0; list-style: none; }
    li { display: flex; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--line); }
    li:last-child { border-bottom: 0; }
    .dot { display: grid; width: 32px; height: 32px; flex: none; place-items: center; border-radius: 50%; }
    .dot mat-icon { width: 18px; height: 18px; font-size: 18px; }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-slate { background: var(--tint-slate); color: var(--tint-slate-ink); }
    .body { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; }
    .line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; font-size: var(--text-sm); }
    .line a { color: var(--ink); font-weight: 600; text-decoration: none; }
    .line a:hover { text-decoration: underline; }
    .kind { padding: 0 8px; border-radius: var(--radius-pill); background: var(--subtle); color: var(--ink-2); font-size: var(--text-xs); line-height: 20px; }
    .subj { margin: 0; color: var(--ink); font-size: var(--text-sm); font-weight: 600; }
    .txt { margin: 0; color: var(--ink-2); font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { margin: 0; color: var(--ink-3); font-size: var(--text-xs); }
    .older {
      width: 100%; min-height: 44px; margin-top: var(--space-3); border: 1px dashed var(--line-strong); border-radius: var(--radius-control);
      background: transparent; color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
  `,
  template: `
    <section class="card">
      <app-panel-head title="Message log" subtitle="Every WhatsApp and email sent to a lead, across the whole team." />
      @if (error() && !items().length) {
        <app-error-state title="Couldn't load the message log" (retry)="load(1)" />
      } @else {
        <ol>
          @for (item of items(); track item.id) {
            <li>
              <span class="dot" [class]="meta(item).tint" aria-hidden="true"><mat-icon>{{ meta(item).icon }}</mat-icon></span>
              <div class="body">
                <p class="line">
                  <a [routerLink]="['/leads', item.lead.id]">{{ item.lead.name }}</a>
                  <span class="kind">{{ meta(item).label }}</span>
                  @if (item.template_name) {
                    <span class="meta">· {{ item.template_name }}</span>
                  }
                </p>
                @if (item.subject) {
                  <p class="subj">{{ item.subject }}</p>
                }
                <p class="txt">{{ item.rendered_text }}</p>
                <p class="meta" [attr.title]="full(item.created_at)">
                  {{ item.created_by?.name ?? 'System' }} · {{ rel(item.created_at) }} · {{ formatPhone(item.lead.phone) }}
                </p>
              </div>
            </li>
          } @empty {
            @if (!loading()) {
              <app-empty-state icon="forum" title="No messages yet" message="WhatsApp and email sends will show up here." [bordered]="false" />
            }
          }
          @if (loading()) {
            @for (i of [0, 1, 2]; track i) {
              <li aria-hidden="true">
                <app-skeleton width="32px" height="32px" radius="50%" />
                <div class="body"><app-skeleton width="40%" height="13px" /><app-skeleton width="75%" height="13px" /></div>
              </li>
            }
          }
        </ol>
        @if (hasMore() && !loading()) {
          <button type="button" class="older" (click)="load(page + 1)">Load older</button>
        }
      }
    </section>
  `,
})
export class MessageLogPage {
  private readonly api = inject(LeadsApi);

  protected readonly items = signal<MessageLogEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly hasMore = signal(false);
  protected page = 1;
  protected readonly full = formatBusinessFull;
  protected readonly formatPhone = formatPhone;

  constructor() {
    this.load(1);
  }

  protected rel(iso: string): string {
    return relativeLabel(iso);
  }

  protected meta(item: MessageLogEntry) {
    return CHANNEL_META[item.channel] ?? CHANNEL_META['WHATSAPP'];
  }

  load(page: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.messages(page).subscribe({
      next: (res) => {
        this.page = page;
        this.items.update((items) => (page === 1 ? res.results : [...items, ...res.results]));
        this.hasMore.set(!!res.next);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
