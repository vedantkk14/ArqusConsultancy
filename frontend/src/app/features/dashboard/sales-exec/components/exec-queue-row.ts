import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { InrCompactPipe } from '../../../../shared/money/inr.pipe';
import { FollowupPill, LeadStatusChip } from '../../../leads/components/lead-bits';
import { relativeLabel } from '../../../leads/utils/business-time';
import { toTelHref, toWhatsappHref } from '../../../leads/utils/phone';
import { ExecLeadItem } from '../sales-exec-dashboard.models';

/**
 * One of the Exec's own leads. Every lead here already belongs to them, so the row always ends in
 * Call/WhatsApp (>= 44px, `toTelHref`/`toWhatsappHref` from the Leads feature - never redefined),
 * never an Assign action. `ageOf` picks which timestamp the age label reads (created_at for a new
 * lead, next_followup_at's absence for "no follow-up" - the row itself has no opinion on that).
 */
@Component({
  selector: 'app-exec-queue-row',
  imports: [FollowupPill, InrCompactPipe, LeadStatusChip, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'exec-row' },
  template: `
    <a class="main" [routerLink]="['/leads', row().id]">
      <span class="name">{{ row().name }}</span>
      <span class="meta">
        <app-lead-status [status]="row().status" />
        @if (showFollowup()) {
          <app-followup-pill [at]="row().next_followup_at" />
        } @else {
          <span class="age">{{ ageLabel() }}</span>
        }
        @if (row().proposed_amount) {
          <span class="amt">{{ row().proposed_amount | inrCompact }}</span>
        }
      </span>
      @if (row().last_note) {
        <span class="note">{{ row().last_note }}</span>
      }
    </a>
    <span class="acts">
      <a class="icon-btn" [href]="tel()" [attr.aria-label]="'Call ' + row().name" [class.off]="!tel()">
        <mat-icon aria-hidden="true">call</mat-icon>
      </a>
      <a class="icon-btn" [href]="whatsapp()" target="_blank" rel="noopener" [attr.aria-label]="'WhatsApp ' + row().name" [class.off]="!whatsapp()">
        <mat-icon aria-hidden="true">chat</mat-icon>
      </a>
    </span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
    }
    :host:last-child {
      border-bottom: 0;
    }
    .main {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      gap: 6px;
      color: inherit;
      text-decoration: none;
    }
    .main:hover .name {
      color: var(--brand-deep);
    }
    .main:focus-visible {
      border-radius: 4px;
      outline: 2px solid var(--brand-deep);
      outline-offset: 2px;
    }
    .name {
      overflow: hidden;
      color: var(--ink);
      font-size: var(--text-sm);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: color var(--dur-fast) ease;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .age {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .amt {
      color: var(--ink-2);
      font-size: var(--text-xs);
      font-weight: 600;
    }
    .note {
      display: -webkit-box;
      overflow: hidden;
      color: var(--ink-3);
      font-size: var(--text-xs);
      line-height: 1.4;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
    }
    .acts {
      display: flex;
      flex: none;
      gap: 2px;
    }
    .icon-btn {
      display: grid;
      width: 44px;
      height: 44px;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--ink-3);
      cursor: pointer;
      text-decoration: none;
    }
    .icon-btn:hover {
      background: var(--tint-slate);
      color: var(--ink);
    }
    .icon-btn:focus-visible {
      outline: 2px solid var(--brand-deep);
      outline-offset: 1px;
    }
    .icon-btn.off {
      pointer-events: none;
      opacity: 0.4;
    }
    .icon-btn mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
    }
  `,
})
export class ExecQueueRow {
  readonly row = input.required<ExecLeadItem>();
  /** False for the "new leads" / "no follow-up" queues, where there is no due date to show. */
  readonly showFollowup = input(true);
  readonly now = input<Date>(new Date());

  protected readonly tel = computed(() => toTelHref(this.row().phone));
  protected readonly whatsapp = computed(() => toWhatsappHref(this.row().phone));
  protected readonly ageLabel = computed(() => `${relativeLabel(this.row().created_at, this.now())} old`);
}
