import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { FollowupPill, LeadAvatar, LeadStatusChip } from '../../../leads/components/lead-bits';
import { toTelHref } from '../../../leads/utils/phone';
import { InrCompactPipe } from '../../../../shared/money/inr.pipe';
import { QueueLeadItem } from '../sales-manager-dashboard.models';

/**
 * One lead in a "Needs attention" subsection. Team-wide (unlike the exec's own dashboard), so
 * every row also carries the owning exec's avatar chip - except an unassigned row, which shows
 * an inline Assign button instead of Call/WhatsApp.
 */
@Component({
  selector: 'app-queue-row',
  imports: [FollowupPill, InrCompactPipe, LeadAvatar, LeadStatusChip, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'queue-row' },
  template: `
    <a class="main" [routerLink]="['/leads', row().id]">
      <span class="who">
        <span class="name">{{ row().name }}</span>
        <span class="meta">
          <app-lead-status [status]="row().status" />
          <span class="src">{{ row().source_label }}</span>
        </span>
      </span>
      <span class="due">
        <app-followup-pill [at]="row().next_followup_at" />
        @if (row().proposed_amount) {
          <span class="amt">{{ row().proposed_amount | inrCompact }}</span>
        }
      </span>
      @if (row().last_note) {
        <span class="note">{{ row().last_note }}</span>
      }
    </a>
    <span class="side">
      @if (row().assigned_to !== undefined) {
        @if (row().assigned_to; as owner) {
          <app-lead-avatar [name]="owner.name" [size]="28" [attr.title]="owner.name" />
        }
        <a class="icon-btn" [href]="tel()" [attr.aria-label]="'Call ' + row().name" [class.off]="!tel()">
          <mat-icon aria-hidden="true">call</mat-icon>
        </a>
        <button
          type="button"
          class="icon-btn"
          [attr.aria-label]="'WhatsApp ' + row().name"
          (click)="whatsapp.emit(row())"
        >
          <mat-icon aria-hidden="true">chat</mat-icon>
        </button>
      } @else {
        <button type="button" class="assign" (click)="assign.emit(row())">Assign</button>
      }
    </span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 4px;
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
      gap: 2px;
      color: inherit;
      text-decoration: none;
    }
    .who {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
    }
    .name {
      overflow: hidden;
      color: var(--ink);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta {
      display: flex;
      flex: none;
      align-items: center;
      gap: 6px;
    }
    .src {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    .due {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .amt {
      color: var(--ink-2);
      font-size: var(--text-sm);
      font-weight: 500;
    }
    .note {
      overflow: hidden;
      color: var(--ink-3);
      font-size: var(--text-xs);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .side {
      display: flex;
      flex: none;
      align-items: center;
      gap: 4px;
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
      padding: 0 12px;
      border: 1px solid var(--brand-deep);
      border-radius: var(--radius-control);
      background: var(--brand-tint);
      color: var(--ink);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 600;
      cursor: pointer;
    }
    .assign:hover {
      background: var(--brand-tint-strong, var(--brand-tint));
    }
  `,
})
export class QueueRow {
  readonly row = input.required<QueueLeadItem>();
  readonly assign = output<QueueLeadItem>();
  readonly whatsapp = output<QueueLeadItem>();

  protected readonly tel = computed(() => toTelHref(this.row().phone));
}
