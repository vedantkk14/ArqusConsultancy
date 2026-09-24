import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanDeactivateFn, Router } from '@angular/router';
import { Observable, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/confirm-dialog/confirm-dialog';
import { PanelHead } from '../../dashboard/components/panel-head';
import { LeadForm, LeadFormSaved } from '../components/lead-form';

export interface LeavesWithChanges {
  hasUnsavedChanges(): boolean;
}

/** Ask before leaving a form with unsaved changes. */
export const unsavedChangesGuard: CanDeactivateFn<LeavesWithChanges> = (component): Observable<boolean> | boolean => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return inject(MatDialog)
    .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      data: {
        title: 'Discard this lead?',
        message: "You have changes that haven't been saved.",
        confirmText: 'Discard',
        cancelText: 'Keep editing',
      },
    })
    .afterClosed()
    .pipe(map((ok) => ok === true));
};

@Component({
  selector: 'app-lead-new-page',
  imports: [LeadForm, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card panel rise-in" aria-labelledby="new-lead-title">
      <app-panel-head title="New lead" subtitle="Contact details first; everything else can wait." headingId="new-lead-title" />
      <app-lead-form [canAssign]="canAssign()" (saved)="onSaved($event)" />
    </section>
  `,
  styles: `
    :host { display: block; max-width: 880px; }
    .panel { padding: var(--space-5); }
    @media (min-width: 768px) { .panel { padding: var(--space-6); } }
  `,
})
export class LeadNewPage implements LeavesWithChanges {
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly form = viewChild.required(LeadForm);
  protected readonly canAssign = computed(() => [Role.Admin, Role.SalesManager].includes(this.auth.role() as Role));

  hasUnsavedChanges(): boolean {
    return this.form().dirty;
  }

  protected onSaved({ lead, addAnother }: LeadFormSaved): void {
    const ref = this.snack.open(`${lead.name} saved.`, 'View lead', { duration: 6000 });
    ref.onAction().subscribe(() => void this.router.navigate(['/leads', lead.id]));
    if (!addAnother) {
      void this.router.navigate(['/leads', lead.id]);
    }
  }
}

