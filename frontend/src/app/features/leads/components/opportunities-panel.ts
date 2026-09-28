import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Opportunity } from '../data/lead.models';
import { formatBusiness, formatBusinessFull } from '../utils/business-time';
import { LeadStatusChip } from './lead-bits';
import { LeadTimeline } from './lead-timeline';

/** "12 Sep 2026" from an ISO time (business time zone). */
function day(iso: string | null): string {
  return iso ? formatBusiness(iso).split(',')[0] : '';
}

/**
 * Every deal with this client, newest first. The current deal is worked with the stage, composer and
 * timeline above; older deals are read-only rows that expand to their own timeline.
 * Project links and the finalized total only arrive for roles allowed to see them.
 */
@Component({
  selector: 'app-opportunities-panel',
  imports: [InrPipe, LeadStatusChip, LeadTimeline, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="deals">
      @for (d of deals(); track d.id) {
        <li class="deal" [class.cur]="d.is_current" [class.focus]="d.id === focusId()" [id]="'deal-' + d.id">
          <div class="top">
            <strong class="no">Deal #{{ d.sequence_no }}</strong>
            <app-lead-status [status]="d.status" />
            @if (d.is_current) {
              <span class="tag">Current</span>
            }
          </div>
          <p class="meta">
            <span [attr.title]="full(d.created_at)">Started {{ day(d.created_at) }}</span>
            @if (d.won_at) {
              <span [attr.title]="full(d.won_at)">Won {{ day(d.won_at) }}</span>
            }
            <span>{{ d.assigned_to?.name ?? 'Unassigned' }}</span>
          </p>
          <p class="money">
            <span>Proposed <b class="num">{{ d.proposed_amount ? (d.proposed_amount | inr) : 'not set' }}</b></span>
            @if (d.finance?.finalized) {
              <span>Final <b class="num">{{ d.finance!.total_amount | inr }}</b></span>
            }
          </p>
          @if (d.project_id) {
            <a class="proj" [routerLink]="['/projects', d.project_id]">
              <mat-icon aria-hidden="true">assignment</mat-icon>
              <span>
                Project: {{ d.project_name }}
                <span class="proj-meta">
                  · {{ d.project_status === 'COMPLETED' ? 'Completed' : 'Running' }} · {{ d.project_pm_name ?? 'No PM' }}
                </span>
              </span>
            </a>
          }
          @if (d.requirements) {
            <p class="req">{{ d.requirements }}</p>
          }
          @if (!d.is_current) {
            <button
              type="button"
              class="more"
              [attr.aria-expanded]="open().has(d.id)"
              [attr.aria-controls]="'deal-tl-' + d.id"
              (click)="toggle(d.id)"
            >
              <mat-icon aria-hidden="true">{{ open().has(d.id) ? 'expand_less' : 'expand_more' }}</mat-icon>
              {{ open().has(d.id) ? 'Hide timeline' : 'Show timeline' }}
            </button>
            @if (open().has(d.id)) {
              <div class="tl" [id]="'deal-tl-' + d.id">
                <app-lead-timeline [leadId]="leadId()" [opportunityId]="d.id" />
              </div>
            }
          }
        </li>
      } @empty {
        <li class="none">No deals yet.</li>
      }
    </ol>
  `,
  styles: `
    .deals { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
    .deal {
      padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control);
      background: var(--surface);
    }
    .deal.cur { border-color: var(--brand-deep); background: var(--brand-tint); }
    .deal.focus { box-shadow: 0 0 0 2px var(--brand-deep); }
    .top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .no { color: var(--ink); font-size: var(--text-md); }
    .tag {
      padding: 0 8px; border-radius: var(--radius-pill); background: var(--surface); color: var(--brand-deep);
      font-size: var(--text-xs); font-weight: 600; line-height: 20px;
    }
    p { margin: 6px 0 0; }
    .meta, .money { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--ink-3); font-size: var(--text-sm); }
    .money b { color: var(--ink); font-weight: 600; }
    .req { color: var(--ink-2); font-size: var(--text-sm); white-space: pre-line; overflow-wrap: anywhere; }
    .proj {
      display: inline-flex; align-items: center; gap: 6px; min-height: 40px; margin-top: 4px;
      color: var(--brand-deep); font-size: var(--text-sm); font-weight: 500; text-decoration: none;
    }
    .proj:hover { text-decoration: underline; }
    .proj mat-icon { width: 18px; height: 18px; font-size: 18px; flex: none; }
    .proj-meta { color: var(--ink-3); font-weight: 400; }
    .more {
      display: inline-flex; align-items: center; gap: 4px; min-height: 40px; margin-top: 4px; padding: 0 8px 0 2px;
      border: 0; border-radius: var(--radius-control); background: transparent; color: var(--ink-2);
      font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    .more:hover { background: var(--subtle); color: var(--ink); }
    .tl { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); }
    .none { color: var(--ink-3); font-size: var(--text-sm); }
  `,
})
export class OpportunitiesPanel {
  readonly leadId = input.required<number>();
  readonly deals = input.required<Opportunity[]>();
  /** A deal to point at (from `?deal=`): an older one opens its timeline. */
  readonly focusId = input<number | null>(null);

  protected readonly open = signal<ReadonlySet<number>>(new Set());
  protected readonly day = day;
  protected readonly full = formatBusinessFull;

  constructor() {
    effect(() => {
      const id = this.focusId();
      const deal = this.deals().find((d) => d.id === id);
      if (deal && !deal.is_current) {
        untracked(() => this.open.update((set) => new Set([...set, deal.id])));
      }
    });
  }

  protected toggle(id: number): void {
    this.open.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
}
