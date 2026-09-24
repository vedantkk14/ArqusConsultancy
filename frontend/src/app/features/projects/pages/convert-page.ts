import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, TemplateRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatBottomSheet, MatBottomSheetModule, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { interval, map } from 'rxjs';
import { ApiError } from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrCompactPipe, InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { ConvertForm } from '../components/convert-form';
import { ConvertibleLead, Manager, ProjectDetail } from '../data/project.models';
import { ProjectsApi } from '../data/projects-api.service';
import { PersonAvatar } from '../ui/bits';
import { formatBusinessFull, formatDay, relativeLabel } from '../ui/business-time';
import { DialogHead } from '../ui/dialog-head';
import { DIALOG_TITLE_ID } from '../ui/open';

const REASONS: Record<string, string> = {
  not_finalized: 'Not finalized yet. An admin confirms the final amount on the lead first.',
  not_won: 'This lead is not won yet.',
};

/** Admin: won deals waiting to become projects. `?lead=<id>` (from the lead page) opens the panel directly. */
@Component({
  selector: 'app-convert-page',
  imports: [
    ConvertForm,
    DialogHead,
    EmptyState,
    ErrorState,
    InrCompactPipe,
    InrPipe,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule,
    PersonAvatar,
    RouterLink,
    Skeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './convert-page.html',
  styleUrl: './convert-page.scss',
})
export class ConvertPage {
  private readonly api = inject(ProjectsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly sheet = inject(MatBottomSheet);
  private readonly snack = inject(MatSnackBar);

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });
  protected readonly now = toSignal(interval(60_000).pipe(map(() => new Date())), { initialValue: new Date() });

  protected readonly rows = signal<ConvertibleLead[]>([]);
  protected readonly managers = signal<Manager[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  /** The lead the panel is open for. */
  protected readonly active = signal<ConvertibleLead | null>(null);
  /** From `?lead=<id>` when that lead cannot be converted: shown instead of the panel. */
  protected readonly blocked = signal<ConvertibleLead | null>(null);
  protected readonly placeholders = [0, 1, 2, 3];
  protected readonly countText = computed(() => {
    const n = this.rows().length;
    return this.loading() ? 'Loading…' : `${n} won ${n === 1 ? 'deal' : 'deals'} waiting`;
  });
  protected readonly titleId = DIALOG_TITLE_ID;

  protected readonly day = formatDay;
  protected readonly full = formatBusinessFull;

  private readonly panel = viewChild.required<TemplateRef<unknown>>('panel');
  /** Resolves once the panel template exists (a fast response must not open it earlier). */
  private readonly viewReady = new Promise<void>((resolve) => afterNextRender(() => resolve()));
  private dialogRef: MatDialogRef<unknown> | null = null;
  private sheetRef: MatBottomSheetRef | null = null;

  constructor() {
    this.api.managers().subscribe({ next: (list) => this.managers.set(list), error: () => undefined });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.convertible().subscribe({
      next: (res) => {
        this.rows.set(res.results);
        this.loading.set(false);
        void this.viewReady.then(() => this.openFromLink());
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** `?lead=<id>` from the lead page or the "finalized" snackbar. */
  private openFromLink(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('lead'));
    if (!id) {
      return;
    }
    const listed = this.rows().find((r) => r.lead === id);
    if (listed && !listed.ineligible_reason) {
      this.open(listed);
      return;
    }
    this.api.convertible(id).subscribe({
      next: (res) => {
        const row = res.results[0];
        if (row && !row.ineligible_reason) {
          this.open(row);
        } else {
          this.blocked.set(row ?? null);
        }
      },
      error: (err: ApiError) => this.snack.open(err.message, 'Dismiss', { duration: 5000 }),
    });
  }

  protected reasonText(row: ConvertibleLead): string {
    return REASONS[row.ineligible_reason ?? ''] ?? 'This lead cannot be converted.';
  }

  protected waiting(row: ConvertibleLead): string {
    return row.won_at ? relativeLabel(row.won_at, this.now()).replace(' ago', '') : '';
  }

  protected open(row: ConvertibleLead): void {
    this.active.set(row);
    if (this.wide()) {
      // A side panel on wide screens: pinned to the right edge, full height.
      this.dialogRef = this.dialog.open(this.panel(), {
        position: { top: '0', right: '0' },
        height: '100vh',
        width: '480px',
        maxWidth: '100vw',
        panelClass: 'convert-panel',
        ariaLabelledBy: DIALOG_TITLE_ID,
        autoFocus: 'first-tabbable',
      });
      this.dialogRef.afterClosed().subscribe(() => this.afterClose());
    } else {
      this.sheetRef = this.sheet.open(this.panel(), { ariaLabel: 'Convert to project' });
      this.sheetRef.afterDismissed().subscribe(() => this.afterClose());
    }
  }

  protected close(): void {
    this.dialogRef?.close();
    this.sheetRef?.dismiss();
  }

  private afterClose(): void {
    this.dialogRef = null;
    this.sheetRef = null;
    this.active.set(null);
    if (this.route.snapshot.queryParamMap.has('lead')) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { lead: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  protected onConverted(project: ProjectDetail): void {
    const lead = this.active()?.lead;
    this.close();
    this.rows.update((rows) => rows.filter((r) => r.lead !== lead));
    this.snack
      .open('Project created', 'Open project', { duration: 8000 })
      .onAction()
      .subscribe(() => void this.router.navigate(['/projects', project.id]));
  }
}
