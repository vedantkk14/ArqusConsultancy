import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ErrorState } from '../../../shared/error-state/error-state';
import { formatInr } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { Interaction, LOST_REASONS, LeadStatus, STATUS_LABELS } from '../data/lead.models';
import { LeadsApi } from '../data/leads-api.service';
import { formatBusinessFull, relativeLabel } from '../utils/business-time';
import { TYPE_META } from './activity-composer';

/** One sentence per timeline entry. System events are described from their stored meta. */
export function describe(item: Interaction): string {
  const m = item.meta ?? {};
  switch (item.type) {
    case 'STATUS_CHANGE': {
      const from = STATUS_LABELS[item.from_status as LeadStatus] ?? item.from_status;
      const to = STATUS_LABELS[item.to_status as LeadStatus] ?? item.to_status;
      const reason = LOST_REASONS.find((r) => r[0] === m['lost_reason'])?.[1];
      return `${from} → ${to}${reason ? ` (${reason})` : ''}${m['amount'] ? ` at ${formatInr(String(m['amount']))}` : ''}`;
    }
    case 'ASSIGNMENT':
      return m['from_name'] ? `Reassigned from ${m['from_name']} to ${m['to_name']}` : `Assigned to ${m['to_name']}`;
    case 'AMOUNT_CHANGE':
      return `Proposed value ${m['from'] ? formatInr(String(m['from'])) : 'not set'} → ${m['to'] ? formatInr(String(m['to'])) : 'cleared'}`;
    default:
      return item.notes || `${TYPE_META[item.type]?.label ?? item.type} logged`;
  }
}

const SYSTEM = new Set(['STATUS_CHANGE', 'ASSIGNMENT', 'AMOUNT_CHANGE']);

@Component({
  selector: 'app-lead-timeline',
  imports: [ErrorState, MatIconModule, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error() && !items().length) {
      <app-error-state title="Couldn't load the timeline" (retry)="load(1)" />
    } @else {
      <ol class="tl">
        @for (item of items(); track item.id) {
          <li [class.sys]="isSystem(item)">
            <span [class]="'dot t-' + meta(item).tint" aria-hidden="true"><mat-icon>{{ meta(item).icon }}</mat-icon></span>
            <div class="body">
              <p class="line">
                <strong>{{ item.created_by?.name ?? 'System' }}</strong>
                @if (!isSystem(item)) {
                  <span class="kind">{{ meta(item).label }}</span>
                }
              </p>
              <p class="txt">{{ text(item) }}</p>
              <time [attr.datetime]="item.created_at" [attr.title]="full(item.created_at)">{{ rel(item.created_at) }}</time>
            </div>
          </li>
        } @empty {
          @if (!loading()) {
            <li class="none">No activity yet. Log the first call above.</li>
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
    .t-plain { border: 1px solid var(--line); background: var(--surface); color: var(--ink-3); }
    .body { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; }
    p { margin: 0; }
    .line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ink); font-size: var(--text-sm); }
    .kind { padding: 0 8px; border-radius: var(--radius-pill); background: var(--subtle); color: var(--ink-2); font-size: var(--text-xs); line-height: 20px; }
    .txt { color: var(--ink-2); font-size: var(--text-sm); white-space: pre-line; overflow-wrap: anywhere; }
    .sys .line strong { font-weight: 500; }
    .sys .txt { color: var(--ink-3); }
    time { color: var(--ink-3); font-size: var(--text-xs); }
    .none { color: var(--ink-3); font-size: var(--text-sm); }
    .older {
      width: 100%; min-height: 44px; border: 1px dashed var(--line-strong); border-radius: var(--radius-control);
      background: transparent; color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
  `,
})
export class LeadTimeline {
  readonly leadId = input.required<number>();
  /** Bump to reload from the newest entry. */
  readonly refresh = input(0);

  private readonly api = inject(LeadsApi);
  protected readonly items = signal<Interaction[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly hasMore = signal(false);
  protected page = 1;
  protected readonly full = formatBusinessFull;
  protected readonly text = describe;

  constructor() {
    effect(() => {
      this.leadId();
      this.refresh();
      untracked(() => this.load(1));
    });
  }

  protected rel(iso: string): string {
    return relativeLabel(iso);
  }

  protected meta(item: Interaction) {
    return TYPE_META[item.type] ?? TYPE_META['NOTE'];
  }

  protected isSystem(item: Interaction): boolean {
    return SYSTEM.has(item.type);
  }

  load(page: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.interactions(this.leadId(), page).subscribe({
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
