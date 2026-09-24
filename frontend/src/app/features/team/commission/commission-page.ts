import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { ApiError } from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { UserAvatar } from '../../../shared/user-avatar/user-avatar';
import { TeamApi } from '../team.api';
import { TeamUser, isValidRate } from '../team.models';
import { FilterShell } from '../ui/filter-shell';
import { PagedList } from '../ui/paged-list';

/** Sales executives with their commission rate; edit one row at a time (save or cancel). */
@Component({
  selector: 'app-commission-page',
  imports: [EmptyState, ErrorState, FilterShell, FormsModule, MatButtonModule, MatIconModule, NgTemplateOutlet, Skeleton, UserAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commission-page.html',
  styleUrls: ['../ui/list-kit.scss', './commission-page.scss'],
})
export class CommissionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TeamApi);
  private readonly snack = inject(MatSnackBar);

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), { initialValue: true });
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly q = computed(() => this.qp().get('q') ?? '');
  protected readonly list = new PagedList<TeamUser>(
    (query, page) => this.api.users({ ...query, page, page_size: 20 }),
    inject(DestroyRef),
  );
  protected readonly placeholders = [0, 1, 2, 3];
  protected readonly editing = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected draft = '';
  private readonly typed = new Subject<string>();

  constructor() {
    effect(() => {
      const q = this.q();
      untracked(() => this.list.load({ role: 'SALES_EXEC', q }));
    });
    this.typed.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((q) => {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { q: q.trim() || null }, queryParamsHandling: 'merge' });
    });
  }

  protected onSearch(value: string): void {
    this.typed.next(value);
  }

  protected clear(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q: null }, queryParamsHandling: 'merge' });
  }

  protected edit(user: TeamUser): void {
    this.draft = user.commission_rate ?? '0.00';
    this.error.set('');
    this.editing.set(user.id);
  }

  protected cancel(): void {
    this.editing.set(null);
    this.error.set('');
  }

  protected save(user: TeamUser): void {
    if (!isValidRate(this.draft)) {
      this.error.set('Enter 0 to 100, up to two decimals.');
      return;
    }
    this.saving.set(true);
    this.api.setCommission(user.id, this.draft.trim()).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.editing.set(null);
        this.list.patch((u) => u.id === saved.id, () => saved);
        this.snack.open(`Commission rate saved for ${saved.name}.`, undefined, { duration: 3000 });
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.error.set(err.details?.['commission_rate'] ? String((err.details['commission_rate'] as string[])[0]) : err.message);
      },
    });
  }
}
