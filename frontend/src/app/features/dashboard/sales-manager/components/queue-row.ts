import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { FollowupPill, LeadAvatar, LeadStatusChip } from '../../../leads/components/lead-bits';
import { toTelHref } from '../../../leads/utils/phone';
import { InrCompactPipe } from '../../../../shared/money/inr.pipe';
import { QueueLeadItem } from '../sales-manager-dashboard.models';

/**
 * One lead in a "Needs attention" card. Stacked (name, then chips, then last note) so it reads well
 * in a third-width card. Team-wide, so each row carries the owning exec's avatar - except an
 * unassigned row, which shows an inline Assign button instead of Call/WhatsApp.
 */
@Component({
  selector: 'app-queue-row',
  imports: [FollowupPill, InrCompactPipe, LeadAvatar, LeadStatusChip, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'queue-row' },
  template: `
    <a class="main" [routerLink]="['/leads', row().id]">
      <span class="name">{{ row().name }}</span>
      <span class="meta">
        <app-lead-status [status]="row().status" />
        <app-followup-pill [at]="row().next_followup_at" />
        @if (row().proposed_amount && row().proposed_amount !== '0.00') {
          <span class="amt">{{ row().proposed_amount | inrCompact }}</span>
        }
      </span>
      @if (row().last_note) {
        <span class="note">{{ row().last_note }}</span>
      } @else {
        <span class="note">{{ row().source_label }}</span>
      }
    </a>
    <span class="side">
      @if (row().assigned_to !== undefined) {
        @if (row().assigned_to; as owner) {
          <app-lead-avatar class="owner" [name]="owner.name" [size]="26" [attr.title]="'Owner: ' + owner.name" />
        }
        <span class="acts">
          <a class="icon-btn" [href]="tel()" [attr.aria-label]="'Call ' + row().name" [class.off]="!tel()">
            <mat-icon aria-hidden="true">call</mat-icon>
          </a>
          <button type="button" class="icon-btn" [attr.aria-label]="'WhatsApp ' + row().name" (click)="whatsapp.emit(row())">
            <mat-icon aria-hidden="true">chat</mat-icon>
          </button>
        </span>
      } @else {
        <button type="button" class="assign" [attr.aria-label]="'Assign ' + row().name" (click)="assign.emit(row())">
          Assign
        </button>
      }
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
    .side {
      display: flex;
      flex: none;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }
    .acts {
      display: flex;
      gap: 2px;
    }
    .icon-btn {
      display: grid;
      width: 32px;
      height: 32px;
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
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .assign {
      height: 32px;
      padding: 0 14px;
      border: 1px solid var(--brand-deep);
      border-radius: var(--radius-control);
      background: var(--surface);
      color: var(--brand-deep);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 600;
      cursor: pointer;
      transition: background-color var(--dur-fast) ease;
    }
    .assign:hover {
      background: var(--brand-tint);
    }
    .assign:focus-visible {
      outline: 2px solid var(--brand-deep);
      outline-offset: 2px;
    }
  `,
})
export class QueueRow {
  readonly row = input.required<QueueLeadItem>();
  readonly assign = output<QueueLeadItem>();
  readonly whatsapp = output<QueueLeadItem>();

  protected readonly tel = computed(() => toTelHref(this.row().phone));
}
