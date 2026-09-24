import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { interval, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { ProjectFiltersBar } from '../components/project-filters';
import { ProjectRows } from '../components/project-rows';
import { ReassignDialog, ReassignDialogData } from '../components/dialogs/reassign-dialog';
import { EMPTY_FILTERS, Manager, ProjectDetail, ProjectFilters, ProjectListItem, ProjectMode } from '../data/project.models';
import { ProjectsApi } from '../data/projects-api.service';
import { ProjectsListStore, filtersFromQuery, listInsight, toQuery } from '../data/projects-list.store';
import { dialogConfig } from '../ui/open';

/** One page for Running and Completed (mode from the route data). PMs only ever see their own projects. */
@Component({
  selector: 'app-projects-list-page',
  imports: [EmptyState, ErrorState, MatButtonModule, MatIconModule, ProjectFiltersBar, ProjectRows, RouterLink],
  providers: [ProjectsListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-list-page.html',
  styleUrl: './projects-list-page.scss',
})
export class ProjectsListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ProjectsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  protected readonly store = inject(ProjectsListStore);

  protected readonly mode: ProjectMode = this.route.snapshot.data['mode'] ?? 'running';
  protected readonly isAdmin = computed(() => this.auth.role() === Role.Admin);

  private readonly queryMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly filters = computed(() => filtersFromQuery((k) => this.queryMap().get(k)));
  protected readonly query = computed(() => toQuery(this.mode, this.filters()), {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });
  protected readonly now = toSignal(interval(60_000).pipe(map(() => new Date())), { initialValue: new Date() });
  protected readonly managers = signal<Manager[]>([]);

  protected readonly insight = computed(() => (this.mode === 'running' ? listInsight(this.store.summary()) : ''));
  protected readonly countText = computed(() => {
    const n = this.store.count();
    const kind = this.mode === 'completed' ? 'completed ' : '';
    return this.store.loaded() ? `${n} ${kind}${n === 1 ? 'project' : 'projects'}` : 'Loading…';
  });
  protected readonly hasFilters = computed(() =>
    Object.entries(this.filters()).some(([key, value]) => key !== 'ordering' && value !== ''),
  );

  constructor() {
    effect(() => {
      const query = this.query();
      untracked(() => this.store.load(query));
    });
    if (this.isAdmin()) {
      this.api.managers().subscribe({ next: (list) => this.managers.set(list), error: () => undefined });
    }
  }

  // ---- Filters (URL is the source of truth) ---------------------------------------------------------

  protected setFilters(patch: Partial<ProjectFilters>): void {
    this.navigate(patch);
  }

  protected clearFilters(): void {
    this.navigate({ ...EMPTY_FILTERS });
  }

  private navigate(patch: Record<string, string>): void {
    const queryParams = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === '' ? null : v]));
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  // ---- Actions --------------------------------------------------------------------------------------

  protected assign(project: ProjectListItem): void {
    this.dialog
      .open<ReassignDialog, ReassignDialogData, ProjectDetail>(
        ReassignDialog,
        dialogConfig({ project: { id: project.id, name: project.name, pm: project.pm ?? null } }),
      )
      .afterClosed()
      .subscribe((updated) => {
        if (updated) {
          this.snack.open(`Assigned ${updated.pm?.name ?? 'a manager'} to ${project.name}.`, undefined, { duration: 3000 });
          this.store.reload();
        }
      });
  }
}
