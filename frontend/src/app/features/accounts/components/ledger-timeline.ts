import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ErrorState } from '../../../shared/error-state/error-state';
import { formatInr } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { LedgerEvent, LedgerEventType as EventType } from '../data/account.models';
import { AccountsApi } from '../data/accounts-api.service';
import { formatBusinessFull, relativeLabel } from '../ui/business-time';

const META: Record<EventType, { icon: string; tint: string }> = {
  CREATED: { icon: 'add_circle', tint: 'cyan' },
  FINALIZED: { icon: 'task_alt', tint: 'teal' },
  TOTAL_REVISED: { icon: 'edit', tint: 'amber' },
  PAYMENT_ADDED: { icon: 'payments', tint: 'teal' },
  PAYMENT_VOIDED: { icon: 'block', tint: 'rose' },
  REMINDER_SENT: { icon: 'chat', tint: 'slate' },
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const money = (v: unknown): string => formatInr(str(v), 'paise');
const modeWord = (v: unknown): string => {
  const text = str(v).toLowerCase().replace(/_/g, ' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'payment';
};

/** One sentence per event, from the data stored with it. */
export function describeEvent(event: LedgerEvent): string {
  const d = event.data ?? {};
  switch (event.type) {
    case 'CREATED':
      return `Ledger created from the won deal (proposed ${money(d['proposed'])}).`;
    case 'FINALIZED':
      return `Total finalized at ${money(d['amount'])}.${d['note'] ? ' ' + str(d['note']) : ''}`;
    case 'TOTAL_REVISED':
      return `Total changed from ${money(d['old'])} to ${money(d['new'])}. Reason: ${str(d['reason'])}`;
    case 'PAYMENT_ADDED':
      return `Received ${money(d['amount'])} by ${modeWord(d['mode'])} (${str(d['receipt_no'])}).`;
    case 'PAYMENT_VOIDED':
      return `Voided ${money(d['amount'])} (${str(d['receipt_no'])}). Reason: ${str(d['reason'])}`;
    case 'REMINDER_SENT':
      return `Payment reminder prepared for ${money(d['outstanding'])} outstanding.`;
    default:
      return '';
  }
}

@Component({
  selector: 'app-ledger-timeline',
  imports: [ErrorState, MatIconModule, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error() && !items().length) {
      <app-error-state title="Couldn't load the timeline" (retry)="load(1)" />
    } @else {
      <ol class="tl">
        @for (item of items(); track item.id) {
          <li>
            <span [class]="'dot t-' + meta(item).tint" aria-hidden="true"><mat-icon>{{ meta(item).icon }}</mat-icon></span>
            <div class="body">
              <p class="line"><strong>{{ item.actor_name ?? 'System' }}</strong></p>
              <p class="txt">{{ text(item) }}</p>
              <time [attr.datetime]="item.created_at" [attr.title]="full(item.created_at)">{{ rel(item.created_at) }}</time>
            </div>
          </li>
        } @empty {
          @if (!loading()) {
            <li class="none">No activity yet.</li>
          }
        }
        @if (loading()) {
          @for (i of [0, 1, 2]; track i) {
            <li aria-hidden="true">
              <app-skeleton width="28px" height="28px" radius="50%" />
              <div class="body"><app-skeleton width="40%" height="13px" /><app-skeleton width="75%" height="13px" /></div>
            </li>
          }
        }
      </ol>
      @if (hasMore() && !loading()) {
        <button type="button" class="older" (click)="load(page + 1)">Load older</button>
      }
    }
  `,
  styles: `
    .tl { margin: 0; padding: 0; list-style: none; }
    li { position: relative; display: flex; gap: 12px; padding-bottom: 18px; }
    li:not(:last-child)::before { position: absolute; top: 32px; bottom: 4px; left: 13px; width: 1px; background: var(--line); content: ''; }
    .dot { display: grid; width: 28px; height: 28px; flex: none; place-items: center; border-radius: 50%; }
    .dot mat-icon { width: 16px; height: 16px; font-size: 16px; }
    .t-cyan { background: var(--tint-cyan); color: var(--tint-cyan-ink); }
    .t-teal { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .t-amber { background: var(--tint-amber); color: var(--tint-amber-ink); }
    .t-slate { background: var(--tint-slate); color: var(--tint-slate-ink); }
    .t-rose { background: var(--tint-rose); color: var(--tint-rose-ink); }
    .body { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; }
    p { margin: 0; }
    .line { color: var(--ink); font-size: var(--text-sm); }
    .line strong { font-weight: 500; }
    .txt { color: var(--ink-2); font-size: var(--text-sm); overflow-wrap: anywhere; }
    time { color: var(--ink-3); font-size: var(--text-xs); }
    .none { color: var(--ink-3); font-size: var(--text-sm); }
    .older {
      width: 100%; min-height: 44px; border: 1px dashed var(--line-strong); border-radius: var(--radius-control);
      background: transparent; color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
  `,
})
export class LedgerTimeline {
  readonly ledgerId = input.required<number>();
  /** Bump to reload from the newest entry. */
  readonly refresh = input(0);

  private readonly api = inject(AccountsApi);
  protected readonly items = signal<LedgerEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly hasMore = signal(false);
  protected page = 1;
  protected readonly full = formatBusinessFull;
  protected readonly text = describeEvent;

  constructor() {
    effect(() => {
      this.ledgerId();
      this.refresh();
      untracked(() => this.load(1));
    });
  }

  protected rel(iso: string): string {
    return relativeLabel(iso);
  }

  protected meta(item: LedgerEvent) {
    return META[item.type] ?? META.CREATED;
  }

  load(page: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.events(this.ledgerId(), page).subscribe({
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
