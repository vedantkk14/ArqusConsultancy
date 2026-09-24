import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
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
  imports: [LeadForm, MatIconModule, PanelHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout">
      <section class="main rise-in" aria-labelledby="new-lead-title">
        <header class="intro">
          <app-panel-head title="New lead" subtitle="Only name and mobile number are required." headingId="new-lead-title" />
        </header>
        <app-lead-form [canAssign]="canAssign()" (saved)="onSaved($event)" />
      </section>
      <aside class="tips card" aria-label="Tips">
        <h2>Good to know</h2>
        <ul>
          <li><mat-icon aria-hidden="true">content_paste</mat-icon>Paste a number in any format; we tidy it to +91.</li>
          <li><mat-icon aria-hidden="true">warning</mat-icon>You'll be warned if the number already belongs to a lead.</li>
          <li><mat-icon aria-hidden="true">person_add</mat-icon>Assign to an executive, to yourself, or decide later.</li>
          <li><mat-icon aria-hidden="true">schedule</mat-icon>Follow-ups are in IST and show up in Overdue once missed.</li>
        </ul>
      </aside>
    </div>
  `,
  styles: `
    :host { display: block; max-width: 1180px; }
    .layout { display: grid; gap: var(--space-5); align-items: start; }
    .intro { padding: var(--space-5); margin-bottom: var(--space-4); border-radius: var(--radius-card); background: var(--grad-ink); }
    .intro ::ng-deep h2 { color: var(--on-ink); font-size: var(--text-lg); }
    .intro ::ng-deep p { color: rgba(255, 255, 255, 0.78); }
    .intro ::ng-deep app-panel-head { margin: 0; }
    .tips { display: none; padding: var(--space-5); }
    .tips h2 { margin: 0 0 var(--space-3); font-size: var(--text-md); }
    .tips ul { display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0; list-style: none; }
    .tips li { display: flex; gap: 10px; color: var(--ink-2); font-size: var(--text-sm); line-height: 1.45; }
    .tips mat-icon { flex: none; width: 20px; height: 20px; font-size: 20px; color: var(--brand-deep); }
    @media (min-width: 1100px) {
      .layout { grid-template-columns: minmax(0, 1fr) 300px; }
      .tips { display: block; }
    }
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

