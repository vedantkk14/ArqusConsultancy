import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { TeamApi } from '../../team/team.api';
import { FilterShell } from '../../team/ui/filter-shell';
import { PagedList } from '../../team/ui/paged-list';
import { SettingsApi } from '../settings.api';
import { ACTION_LABELS, AuditEntry, fieldLabel, modelName, showValue } from '../settings.models';

const KEYS = ['q', 'model_label', 'actor', 'action', 'from', 'to'] as const;

/** Who changed what and when. Each row expands to a before/after list of the fields that changed. */
@Component({
  selector: 'app-audit-log-page',
  imports: [EmptyState, ErrorState, FilterShell, MatButtonModule, MatIconModule, NgTemplateOutlet, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit-log-page.html',
  styleUrls: ['../../team/ui/list-kit.scss', './audit-log-page.scss'],
})
export class AuditLogPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(SettingsApi);

  protected readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)').pipe(map((s) => s.matches)), {
    initialValue: true,
  });
  private readonly qp = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly filters = computed(
    () => Object.fromEntries(KEYS.map((k) => [k, this.qp().get(k) ?? ''])) as Record<(typeof KEYS)[number], string>,
  );
  protected readonly anyFilter = computed(() => Object.values(this.filters()).some(Boolean));
  protected readonly dropdownCount = computed(() => Object.entries(this.filters()).filter(([k, v]) => k !== 'q' && v).length);

  protected readonly list = new PagedList<AuditEntry>((query, page) => this.api.audit({ ...query, page }), inject(DestroyRef));
  protected readonly models = toSignal(this.api.auditModels(), { initialValue: [] as string[] });
  protected readonly actors = toSignal(inject(TeamApi).users({ page_size: 100 }).pipe(map((r) => r.results)), { initialValue: [] });
  protected readonly open = signal<ReadonlySet<number>>(new Set());
  protected readonly placeholders = [0, 1, 2, 3, 4];
  protected readonly actions = Object.entries(ACTION_LABELS);
  protected readonly actionLabels = ACTION_LABELS;
  protected readonly modelName = modelName;
  protected readonly show = showValue;
  protected readonly field = fieldLabel;
  protected readonly countText = computed(() => {
    const n = this.list.count();
    return this.list.loaded() ? `${n} ${n === 1 ? 'entry' : 'entries'}` : 'Loading…';
  });
  private readonly typed = new Subject<string>();

  constructor() {
    effect(() => {
      const f = this.filters();
      untracked(() => this.list.load({ ...f }));
    });
    this.typed.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((q) => this.set('q', q.trim()));
  }

  protected onSearch(value: string): void {
    this.typed.next(value);
  }

  protected set(key: string, value: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [key]: value || null }, queryParamsHandling: 'merge' });
  }

  protected clear(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: Object.fromEntries(KEYS.map((k) => [k, null])),
      queryParamsHandling: 'merge',
    });
  }

  protected toggle(id: number): void {
    this.open.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected entries(e: AuditEntry): [string, { old: unknown; new: unknown }][] {
    return Object.entries(e.changes);
  }

  protected when(iso: string): string {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(new Date(iso));
  }
}
