import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { LeadDetail } from '../../data/lead.models';
import { LeadForm, LeadFormSaved } from '../lead-form';
import { DialogHead } from './dialog-head';

export interface EditLeadDialogData {
  lead: LeadDetail;
  /** Sales Exec: only email and requirements. */
  limited: boolean;
}

/** "Edit lead" sheet: the same lead-form as /leads/new, in edit mode. */
@Component({
  selector: 'app-edit-lead-dialog',
  imports: [DialogHead, LeadForm, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dialog-head title="Edit lead" [subtitle]="data.lead.name" />
    <app-lead-form [lead]="data.lead" [limited]="data.limited" (saved)="done($event)" (cancelled)="ref.close()" />
  `,
  styles: `
    :host {
      display: block;
      box-sizing: border-box;
      width: 100%;
      max-height: 90vh;
      padding: var(--space-6);
      overflow-x: hidden;
      overflow-y: auto;
    }
  `,
})
export class EditLeadDialog {
  protected readonly data = inject<EditLeadDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<EditLeadDialog, LeadDetail>);

  protected done(saved: LeadFormSaved): void {
    this.ref.close(saved.lead);
  }
}
