import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError, ROLE_LABELS, Role } from '../../../core/models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { RoleBadge } from '../../../shared/role-badge/role-badge';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';
import { CreateAccountDialog } from '../../dashboard/components/create-account-dialog';
import { relativeTime } from '../../dashboard/dashboard-utils';
import { TeamApi } from '../team.api';
import { TeamUser } from '../team.models';
import { FilterShell } from '../ui/filter-shell';
import { PagedList } from '../ui/paged-list';
import { EditUserDialog, EditUserDialogData } from './edit-user-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';

export const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-users-page',
  imports: [EmptyState, ErrorState, FilterShell, MatButtonModule, MatIconModule, MatMenuModule, NgTemplateOutlet, RoleBadge, Skeleton, UserAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-page.html',
  styleUrls: ['../ui/list-kit.scss', './users-page.scss'],
})
export class UsersPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TeamApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  protected readonly me = computed(() => this.auth.user()?.id ?? null);

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly filters = computed(() => ({
    q: this.qp().get('q') ?? '',
    role: this.qp().get('role') ?? '',
    is_active: this.qp().get('is_active') ?? '',
  }));
  protected readonly anyFilter = computed(() => Object.values(this.filters()).some(Boolean));
  protected readonly dropdownCount = computed(() => [this.filters().role, this.filters().is_active].filter(Boolean).length);

  protected readonly list = new PagedList<TeamUser>(
    (query, page) => this.api.users({ ...query, page, page_size: 20 }),
    inject(DestroyRef),
  );
  protected readonly roles = Object.values(Role).map((value) => ({ value, label: ROLE_LABELS[value] }));
  protected readonly placeholders = [0, 1, 2, 3, 4];
  protected readonly ago = relativeTime;
  protected readonly countText = computed(() => {
    const n = this.list.count();
    return this.list.loaded() ? `${n} ${n === 1 ? 'user' : 'users'}` : 'Loading…';
  });

  private readonly typed = new Subject<string>();

  constructor() {
    effect(() => {
      const f = this.filters();
      untracked(() => this.list.load({ q: f.q, role: f.role, is_active: f.is_active }));
    });
    this.typed
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((q) => this.set('q', q.trim()));
  }

  protected onSearch(value: string): void {
    this.typed.next(value);
  }

  protected set(key: string, value: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [key]: value || null }, queryParamsHandling: 'merge' });
  }

  protected clear(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q: null, role: null, is_active: null }, queryParamsHandling: 'merge' });
  }

  // ---- Actions -----------------------------------------------------------------------------------------------------------

  protected add(): void {
    this.dialog
      .open(CreateAccountDialog, { width: '640px', maxWidth: 'calc(100vw - 32px)', autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe(() => this.list.reload()); // closing with the X after creating must still refresh the list
  }

  protected edit(user: TeamUser): void {
    this.dialog
      .open<EditUserDialog, EditUserDialogData, TeamUser>(EditUserDialog, {
        data: { user, isSelf: user.id === this.me() },
        width: '640px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.list.patch((u) => u.id === saved.id, () => saved);
          this.snack.open(`${saved.name} updated.`, undefined, { duration: 3000 });
        }
      });
  }

  protected resetPassword(user: TeamUser): void {
    this.dialog.open(ResetPasswordDialog, { data: { user }, width: '520px', maxWidth: 'calc(100vw - 32px)' });
  }

  protected toggleActive(user: TeamUser): void {
    const off = user.is_active;
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data: {
          title: off ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`,
          message: off
            ? 'They are signed out at once and cannot sign in until you reactivate them. Their records are kept.'
            : 'They can sign in again with their current password.',
          confirmText: off ? 'Deactivate' : 'Reactivate',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) {
          return;
        }
        (off ? this.api.deactivate(user.id) : this.api.reactivate(user.id)).subscribe({
          next: (saved) => {
            this.list.patch((u) => u.id === saved.id, () => saved);
            this.snack.open(`${saved.name} ${off ? 'deactivated' : 'reactivated'}.`, undefined, { duration: 3000 });
          },
          error: (err: ApiError) => this.snack.open(err.message, 'Dismiss', { duration: 6000 }),
        });
      });
  }
}
