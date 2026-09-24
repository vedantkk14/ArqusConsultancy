import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { LeadDetail } from '../../data/lead.models';
import { LeadForm, LeadFormSaved } from '../lead-form';

export interface EditLeadDialogData {
  lead: LeadDetail;
  /** Sales Exec: only email and requirements. */
  limited: boolean;
}

/** "Edit lead" sheet: the same lead-form as /leads/new, in edit mode. */
@Component({
  selector: 'app-edit-lead-dialog',
  imports: [LeadForm, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Edit lead</h2>
    <app-lead-form [lead]="data.lead" [limited]="data.limited" (saved)="done($event)" (cancelled)="ref.close()" />
  `,
  styles: `
    :host { display: block; width: min(760px, calc(100vw - 32px)); max-height: 85vh; padding: var(--space-6); overflow-y: auto; }
    h2 { margin: 0 0 var(--space-4); font-size: var(--text-lg); }
  `,
})
export class EditLeadDialog {
  protected readonly data = inject<EditLeadDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<EditLeadDialog, LeadDetail>);

  protected done(saved: LeadFormSaved): void {
    this.ref.close(saved.lead);
  }
}
