import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatBottomSheet, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError, Role } from '../../../core/models';
import { LayoutService } from '../../../layout/layout.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { PanelHead } from '../../dashboard/components/panel-head';
import { ActivityComposer } from '../components/activity-composer';
import { AssignDialog, AssignDialogData } from '../components/dialogs/assign-dialog';
import { EditLeadDialog, EditLeadDialogData } from '../components/dialogs/edit-lead-dialog';
import { FinalizeDialog, FinalizeDialogData } from '../components/dialogs/finalize-dialog';
import { StatusDialog, StatusDialogData } from '../components/dialogs/status-dialog';
import { WhatsAppDialog, WhatsAppDialogData } from '../components/dialogs/whatsapp-dialog';
import { FollowupPill, LeadAvatar, LeadStatusChip, STATUS_TINT } from '../components/lead-bits';
import { LeadTimeline } from '../components/lead-timeline';
import { MoneyInput, isPositiveMoney } from '../components/money-input';
import { StageStepper } from '../components/stage-stepper';
import { LOST_REASONS, LeadDetail, LeadStatus } from '../data/lead.models';
import { LeadsApi } from '../data/leads-api.service';
import { atBusinessTime, formatBusinessFull, nextMonday, relativeLabel } from '../utils/business-time';
import { formatPhone, toTelHref } from '../utils/phone';

const MANAGERS: Role[] = [Role.Admin, Role.SalesManager];

@Component({
  selector: 'app-lead-detail-page',
  imports: [
    ActivityComposer,
    EmptyState,
    FollowupPill,
    FormsModule,
    InrPipe,
    LeadAvatar,
    LeadStatusChip,
    LeadTimeline,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MoneyInput,
    PanelHead,
    RouterLink,
    StageStepper,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lead-detail-page.html',
  styleUrls: ['./lead-detail-page.scss', './lead-detail-cards.scss', '../components/leads-menu.scss'],
})
export class LeadDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(LeadsApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly sheet = inject(MatBottomSheet);
  private readonly snack = inject(MatSnackBar);
  protected readonly layout = inject(LayoutService);

  private readonly resolved = toSignal(this.route.data.pipe(map((d) => (d['lead'] as LeadDetail | null) ?? null)), {
    initialValue: (this.route.snapshot.data['lead'] as LeadDetail | null) ?? null,
  });
  private readonly updated = signal<LeadDetail | null>(null);
  protected readonly lead = computed(() => {
    const fresh = this.updated();
    const base = this.resolved();
    return fresh && base && fresh.id === base.id ? fresh : base;
  });
  protected readonly timelineTick = signal(0);

  /** Back goes to the list the lead belongs to: All leads, or Won / Lost leads once it is closed. */
  protected readonly back = computed(() => {
    const status = this.lead()?.status;
    return status === 'WON'
      ? { link: '/leads/won', label: 'Won leads' }
      : status === 'LOST'
        ? { link: '/leads/lost', label: 'Lost leads' }
        : { link: '/leads/all', label: 'All leads' };
  });

  protected readonly isManager = computed(() => MANAGERS.includes(this.auth.role() as Role));
  protected readonly isAdmin = computed(() => this.auth.role() === Role.Admin);
  protected readonly glow = computed(() => STATUS_TINT[this.lead()?.status ?? 'NEW']);
  protected readonly tel = computed(() => toTelHref(this.lead()?.phone));
  protected readonly closed = computed(() => ['WON', 'LOST'].includes(this.lead()?.status ?? ''));
  protected readonly lostReason = computed(() => LOST_REASONS.find((r) => r[0] === this.lead()?.lost_reason)?.[1] ?? '');
  protected readonly formatPhone = formatPhone;
  protected readonly full = formatBusinessFull;
  protected readonly rel = relativeLabel;
  protected readonly snoozes = [
    { label: 'Tomorrow 10 am', at: () => atBusinessTime(1, 10) },
    { label: 'In 3 days', at: () => atBusinessTime(3, 10) },
    { label: 'Next Monday', at: () => nextMonday(10) },
  ];

  protected readonly editingAmount = signal(false);
  protected amountDraft = '';
  protected readonly amountError = signal('');

  private readonly composer = viewChild<ActivityComposer>('composer');
  private readonly composerSheet = viewChild.required<TemplateRef<unknown>>('composerSheet');
  private sheetRef: MatBottomSheetRef | null = null;

  // ---- Data ---------------------------------------------------------------------------------------

  protected refresh(): void {
    const lead = this.lead();
    if (!lead) {
      return;
    }
    this.api.get(lead.id).subscribe((fresh) => this.updated.set(fresh));
    this.timelineTick.update((n) => n + 1);
  }

  private apply(fresh: LeadDetail | null | undefined): void {
    if (fresh) {
      this.updated.set(fresh);
      this.timelineTick.update((n) => n + 1);
    }
  }

  // ---- Header actions -----------------------------------------------------------------------------

  protected openWhatsApp(lead: LeadDetail): void {
    this.dialog
      .open<WhatsAppDialog, WhatsAppDialogData, boolean>(WhatsAppDialog, { data: { lead } })
      .afterClosed()
      .subscribe((sent) => sent && this.refresh());
  }

  protected logActivity(): void {
    if (this.layout.isDesktop()) {
      document.getElementById('log-activity')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.composer()?.focus();
      return;
    }
    this.sheetRef = this.sheet.open(this.composerSheet(), { ariaLabel: 'Log activity' });
  }

  protected onLogged(): void {
    this.sheetRef?.dismiss();
    this.sheetRef = null;
    this.snack.open('Activity logged.', undefined, { duration: 2500 });
    this.refresh();
  }

  protected edit(lead: LeadDetail): void {
    this.dialog
      .open<EditLeadDialog, EditLeadDialogData, LeadDetail>(EditLeadDialog, {
        data: { lead, limited: !this.isManager() },
        // Material caps dialogs at 560px; the form's two-column layout needs more room.
        width: '760px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.apply(saved);
          // Re-resolve so the top bar's title follows a renamed lead.
          void this.router.navigateByUrl(this.router.url, { onSameUrlNavigation: 'reload' });
        }
      });
  }

  protected remove(lead: LeadDetail): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data: {
          title: `Delete ${lead.name}?`,
          message: 'The lead is hidden from every list. Its history is kept.',
          confirmText: 'Delete lead',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) {
          return;
        }
        this.api.remove(lead.id).subscribe({
          next: () => {
            this.snack.open(`${lead.name} deleted.`, undefined, { duration: 3000 });
            void this.router.navigate(['/leads/all']);
          },
          error: (err: ApiError) =>
            this.snack.open(
              err.code === 'has_ledger' ? 'This lead has an account ledger and cannot be deleted.' : err.message,
              'Dismiss',
              { duration: 6000 },
            ),
        });
      });
  }

  protected reassign(lead: LeadDetail): void {
    this.dialog
      .open<AssignDialog, AssignDialogData, boolean>(AssignDialog, {
        data: { ids: [lead.id], label: lead.name, currentId: lead.assigned_to?.id },
      })
      .afterClosed()
      .subscribe((done) => done && this.refresh());
  }

  protected changeStatus(lead: LeadDetail, to: LeadStatus): void {
    this.dialog
      .open<StatusDialog, StatusDialogData, LeadDetail>(StatusDialog, { data: { lead, to } })
      .afterClosed()
      .subscribe((fresh) => this.apply(fresh));
  }

  protected finalize(lead: LeadDetail): void {
    this.dialog
      .open<FinalizeDialog, FinalizeDialogData, LeadDetail>(FinalizeDialog, { data: { lead } })
      .afterClosed()
      .subscribe((fresh) => {
        if (fresh) {
          this.apply(fresh);
          this.snack
            .open('Amount finalized.', 'Convert to project', { duration: 8000 })
            .onAction()
            .subscribe(() => void this.router.navigate(['/projects/convert'], { queryParams: { lead: lead.id } }));
        }
      });
  }

  // ---- Cards ----------------------------------------------------------------------------------------

  protected setFollowup(lead: LeadDetail, at: string | null): void {
    this.api.update(lead.id, { next_followup_at: at }).subscribe({
      next: (fresh) => {
        this.updated.set(fresh);
        this.snack.open(at ? 'Follow-up set.' : 'Follow-up cleared.', undefined, { duration: 2500 });
      },
      error: (err: ApiError) => this.snack.open(err.message, 'Dismiss', { duration: 5000 }),
    });
  }

  protected startAmountEdit(lead: LeadDetail): void {
    this.amountDraft = lead.proposed_amount ?? '';
    this.amountError.set('');
    this.editingAmount.set(true);
  }

  protected saveAmount(lead: LeadDetail): void {
    if (!isPositiveMoney(this.amountDraft)) {
      this.amountError.set('Enter a value above zero.');
      return;
    }
    this.api.update(lead.id, { proposed_amount: this.amountDraft }).subscribe({
      next: (fresh) => {
        this.editingAmount.set(false);
        this.apply(fresh);
      },
      error: (err: ApiError) => this.amountError.set(err.message),
    });
  }
}
