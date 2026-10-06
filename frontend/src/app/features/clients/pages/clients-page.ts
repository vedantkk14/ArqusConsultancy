import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { formatPhone } from '../../leads/utils/phone';
import { PanelHead } from '../../dashboard/components/panel-head';
import { AddClientProjectData, AddClientProjectDialog } from '../components/add-client-project-dialog';
import { ClientRow } from '../data/client.models';
import { ClientsApi } from '../data/clients-api.service';

/** My Clients (admin): every client with a running or completed project, and a quick way to add the next one. */
@Component({
  selector: 'app-clients-page',
  imports: [EmptyState, ErrorState, MatButtonModule, MatIconModule, PanelHead, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .card { padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
    .search {
      display: flex; align-items: center; gap: 8px; min-height: 44px; margin-bottom: var(--space-4); padding: 0 14px;
      border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: var(--surface);
    }
    .search input { flex: 1; border: 0; background: transparent; color: var(--ink); font: inherit; outline: none; }
    .search mat-icon { color: var(--ink-3); }
    ul.clients { display: flex; flex-direction: column; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
    .client { padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); }
    .top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
    .who { min-width: 0; }
    .nm { margin: 0; color: var(--ink); font-size: var(--text-md, 1rem); font-weight: 600; }
    .nm a { color: inherit; text-decoration: none; }
    .nm a:hover { text-decoration: underline; }
    .contact { margin: 2px 0 0; color: var(--ink-3); font-size: var(--text-sm); overflow-wrap: anywhere; }
    .counts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chip { padding: 0 10px; border-radius: var(--radius-pill); font-size: var(--text-xs); line-height: 22px; font-weight: 600; }
    .run { background: var(--tint-teal); color: var(--tint-teal-ink); }
    .done { background: var(--tint-slate); color: var(--tint-slate-ink); }
    ol.projects { margin: var(--space-3) 0 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
    ol.projects li {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--line);
      font-size: var(--text-sm);
    }
    ol.projects li:last-child { border-bottom: 0; padding-bottom: 0; }
    .no { min-width: 28px; color: var(--ink-3); font-weight: 600; }
    .pn { color: var(--ink); font-weight: 500; text-decoration: none; }
    .pn:hover { text-decoration: underline; }
    .pm { margin-left: auto; color: var(--ink-3); font-size: var(--text-xs); }
    .older {
      width: 100%; min-height: 44px; margin-top: var(--space-4); border: 1px dashed var(--line-strong); border-radius: var(--radius-control);
      background: transparent; color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
  `,
  template: `
    <section class="card">
      <app-panel-head
        title="My clients"
        subtitle="Clients with a running or completed project. Add their next project in one step."
      />
      <div class="search">
        <mat-icon aria-hidden="true">search</mat-icon>
        <input
          type="text"
          placeholder="Search clients by name, phone or email…"
          aria-label="Search clients"
          [value]="query()"
          (input)="onQuery($event)"
        />
      </div>

      @if (error() && !clients().length) {
        <app-error-state title="Couldn't load your clients" (retry)="load(1)" />
      } @else {
        <ul class="clients">
          @for (c of clients(); track c.id) {
            <li class="client">
              <div class="top">
                <div class="who">
                  <p class="nm">
                    <a [routerLink]="['/leads', c.id]">{{ c.name }}</a>
                  </p>
                  <p class="contact">{{ formatPhone(c.phone) }}@if (c.email) { · {{ c.email }} }</p>
                  <div class="counts">
                    @if (c.running_projects) {
                      <span class="chip run">{{ c.running_projects }} running</span>
                    }
                    @if (c.completed_projects) {
                      <span class="chip done">{{ c.completed_projects }} completed</span>
                    }
                  </div>
                </div>
                <button
                  matButton="filled"
                  type="button"
                  (click)="addProject(c)"
                  [attr.aria-label]="'Add a new project for ' + c.name"
                >
                  <mat-icon>add</mat-icon>Add project
                </button>
              </div>
              <ol class="projects">
                @for (p of c.projects; track p.id) {
                  <li>
                    <span class="no">#{{ p.no }}</span>
                    <a class="pn" [routerLink]="['/projects', p.id]">{{ p.name }}</a>
                    <span class="chip" [class.run]="p.status === 'RUNNING'" [class.done]="p.status === 'COMPLETED'">
                      {{ p.status === 'RUNNING' ? 'Running' : 'Completed' }}
                    </span>
                    <span class="pm">{{ p.pm_name ? 'PM: ' + p.pm_name : 'No project manager yet' }}</span>
                  </li>
                }
              </ol>
            </li>
          } @empty {
            @if (!loading()) {
              <app-empty-state
                icon="handshake"
                [title]="query() ? 'No clients match' : 'No clients yet'"
                [message]="query() ? 'Try a different name, phone or email.' : 'Clients show up here once a won lead becomes a project.'"
                [bordered]="false"
              />
            }
          }
          @if (loading()) {
            @for (i of [0, 1, 2]; track i) {
              <li class="client" aria-hidden="true">
                <app-skeleton width="40%" height="16px" />
                <app-skeleton width="70%" height="13px" />
              </li>
            }
          }
        </ul>
        @if (hasMore() && !loading()) {
          <button type="button" class="older" (click)="load(page + 1)">Load more</button>
        }
      }
    </section>
  `,
})
export class ClientsPage {
  private readonly api = inject(ClientsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  protected readonly clients = signal<ClientRow[]>([]);
  protected readonly query = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly hasMore = signal(false);
  protected page = 1;
  protected readonly formatPhone = formatPhone;
  private readonly search$ = new Subject<string>();

  constructor() {
    this.search$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.load(1));
    this.load(1);
  }

  protected onQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.search$.next(value.trim());
  }

  load(page: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.list(page, this.query().trim()).subscribe({
      next: (res) => {
        this.page = page;
        this.clients.update((rows) => (page === 1 ? res.results : [...rows, ...res.results]));
        this.hasMore.set(!!res.next);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected addProject(client: ClientRow): void {
    this.dialog
      .open<AddClientProjectDialog, AddClientProjectData, { project: number; client: ClientRow }>(
        AddClientProjectDialog,
        { data: { client: { id: client.id, name: client.name } } },
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.clients.update((rows) => rows.map((r) => (r.id === result.client.id ? result.client : r)));
        this.snack.open(`New project added for ${client.name}.`, undefined, { duration: 4000 });
      });
  }
}
