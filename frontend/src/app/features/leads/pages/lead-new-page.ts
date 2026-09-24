import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanDeactivateFn, Router } from '@angular/router';
import { Observable, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/confirm-dialog/confirm-dialog';
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
  imports: [LeadForm, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout">
      <section class="main rise-in" aria-labelledby="new-lead-title">
        <header class="intro">
          <span class="badge" aria-hidden="true"><mat-icon>person_add</mat-icon></span>
          <div>
            <h2 id="new-lead-title">New lead</h2>
            <p>Only name and mobile number are required. The rest can wait.</p>
          </div>
        </header>
        <div class="card form-card">
          <app-lead-form [canAssign]="canAssign()" (saved)="onSaved($event)" />
        </div>
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
    :host { display: block; container-type: inline-size; max-width: 1180px; }
    .layout { display: grid; gap: var(--space-5); align-items: start; }
    .intro {
      position: relative; display: flex; align-items: center; gap: 16px; overflow: hidden;
      margin-bottom: var(--space-4); padding: var(--space-5); border-radius: var(--radius-card);
      background: radial-gradient(60% 120% at 100% 0%, color-mix(in srgb, var(--data-cyan) 30%, transparent), transparent 70%), var(--grad-ink);
      color: var(--on-ink);
    }
    .badge { display: grid; width: 48px; height: 48px; flex: none; place-items: center; border-radius: 14px; background: rgba(255, 255, 255, 0.12); }
    .badge mat-icon { width: 26px; height: 26px; font-size: 26px; }
    .intro h2 { margin: 0; color: var(--on-ink); font-size: var(--text-lg); }
    .intro p { margin: 2px 0 0; color: rgba(255, 255, 255, 0.8); font-size: var(--text-sm); }
    .form-card { padding: var(--space-5); }
    .tips { display: none; padding: var(--space-5); }
    .tips h2 { margin: 0 0 var(--space-3); font-size: var(--text-md); }
    .tips ul { display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0; list-style: none; }
    .tips li { display: flex; gap: 10px; color: var(--ink-2); font-size: var(--text-sm); line-height: 1.45; }
    .tips mat-icon { flex: none; width: 20px; height: 20px; font-size: 20px; color: var(--brand-deep); }
    @container (min-width: 900px) {
      .layout { grid-template-columns: minmax(0, 1fr) 280px; }
      .tips { display: block; }
      .form-card { padding: var(--space-6); }
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
