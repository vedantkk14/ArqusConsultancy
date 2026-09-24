import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiError } from '../../../core/models';
import {
  LOST_REASONS,
  LeadDetail,
  LeadStatus,
  LostReason,
  NewInteraction,
  STATUS_LABELS,
  USER_INTERACTION_TYPES,
  UserInteractionType,
} from '../data/lead.models';
import { LeadsApi } from '../data/leads-api.service';
import { toBusinessIso } from '../utils/business-time';
import { serverErrors } from './dialogs/status-dialog';
import { FollowupPicker } from './followup-picker';
import { MoneyInput, isPositiveMoney } from './money-input';

export const TYPE_META: Record<string, { label: string; icon: string; tint: string }> = {
  CALL: { label: 'Call', icon: 'call', tint: 'cyan' },
  WHATSAPP: { label: 'WhatsApp', icon: 'chat', tint: 'teal' },
  EMAIL: { label: 'Email', icon: 'mail', tint: 'slate' },
  MEETING: { label: 'Meeting', icon: 'groups', tint: 'amber' },
  NOTE: { label: 'Note', icon: 'sticky_note_2', tint: 'slate' },
  STATUS_CHANGE: { label: 'Status', icon: 'swap_horiz', tint: 'plain' },
  ASSIGNMENT: { label: 'Assignment', icon: 'person_add', tint: 'plain' },
  AMOUNT_CHANGE: { label: 'Amount', icon: 'currency_rupee', tint: 'plain' },
};

/** Log a call / WhatsApp / email / meeting / note, optionally moving the stage and setting a follow-up. */
@Component({
  selector: 'app-activity-composer',
  imports: [FollowupPicker, FormsModule, MatButtonModule, MatIconModule, MoneyInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './activity-composer.html',
  styleUrl: './activity-composer.scss',
})
export class ActivityComposer {
  readonly lead = input.required<LeadDetail>();
  readonly logged = output<void>();

  private readonly api = inject(LeadsApi);
  private readonly notesBox = viewChild<ElementRef<HTMLTextAreaElement>>('notesBox');

  protected readonly types = USER_INTERACTION_TYPES;
  protected readonly meta = TYPE_META;
  protected readonly labels = STATUS_LABELS;
  protected readonly reasons = LOST_REASONS;

  protected readonly type = signal<UserInteractionType>('CALL');
  protected notes = '';
  protected readonly newStatus = signal<LeadStatus | ''>('');
  protected followup = '';
  protected amount = '';
  protected reason: LostReason | '' = '';
  protected readonly saving = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly followupSet = signal(false);

  protected readonly closed = computed(() => ['WON', 'LOST'].includes(this.lead().status));
  protected readonly nudge = computed(
    () => !this.closed() && !this.followupSet() && !['WON', 'LOST'].includes(this.newStatus()),
  );

  constructor() {
    // New lead: logging an outbound touch moves it to Contacted, so preselect that.
    effect(() => {
      const lead = this.lead();
      untracked(() => {
        this.newStatus.set(lead.status === 'NEW' && lead.allowed_transitions.includes('CONTACTED') ? 'CONTACTED' : '');
        this.amount = lead.proposed_amount ?? '';
      });
    });
  }

  focus(): void {
    this.notesBox()?.nativeElement.focus();
  }

  protected submit(): void {
    const errors: Record<string, string> = {};
    const status = this.newStatus();
    if (status === 'WON' && !isPositiveMoney(this.amount)) {
      errors['proposed_amount'] = 'Enter the proposed value to mark this lead won.';
    }
    if (status === 'LOST' && !this.reason) {
      errors['lost_reason'] = 'Choose why this lead was lost.';
    }
    if (!this.notes.trim() && this.type() === 'NOTE') {
      errors['notes'] = 'Write the note first.';
    }
    this.errors.set(errors);
    if (Object.keys(errors).length) {
      return;
    }
    const body: NewInteraction = { type: this.type(), notes: this.notes.trim() };
    if (status && status !== this.lead().status) {
      body.new_status = status;
      if (status === 'WON') body.proposed_amount = this.amount;
      if (status === 'LOST') body.lost_reason = this.reason as LostReason;
    }
    const fu = toBusinessIso(this.followup);
    if (fu && !['WON', 'LOST'].includes(status)) {
      body.next_followup_at = fu;
    }
    this.saving.set(true);
    this.api.logInteraction(this.lead().id, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.notes = '';
        this.followup = '';
        this.reason = '';
        this.followupSet.set(false);
        this.logged.emit();
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.errors.set(serverErrors(err));
      },
    });
  }
}
