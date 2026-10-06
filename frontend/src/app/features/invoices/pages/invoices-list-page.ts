import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { InvoiceRow } from '../data/invoice.models';
import { InvoicesApi } from '../data/invoices-api.service';

/** Invoices: the Generate invoice button first, then every invoice made so far with a search box. */
@Component({
  selector: 'app-invoices-list-page',
  imports: [EmptyState, ErrorState, InrPipe, MatButtonModule, MatIconModule, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .generate {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);
      margin-bottom: var(--space-5); padding: var(--space-5); border: 1px solid var(--line);
      border-radius: var(--radius-card); background: var(--surface);
    }
    .generate h2 { margin: 0; font-size: var(--text-lg); font-weight: 600; }
    .generate p { margin: 2px 0 0; color: var(--ink-3); font-size: var(--text-sm); }
    .card { padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
    .head h2 { margin: 0; font-size: var(--text-lg); font-weight: 600; }
    .head .sub { margin: 2px 0 0; color: var(--ink-3); font-size: var(--text-sm); }
    .search {
      display: flex; align-items: center; gap: 8px; min-height: 44px; min-width: min(360px, 100%); padding: 0 14px;
      border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: var(--surface);
    }
    .search input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ink); font: inherit; outline: none; }
    .search mat-icon { color: var(--ink-3); }
    table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
    th { padding: 10px 12px; background: var(--subtle); color: var(--ink-3); font-size: var(--text-xs); font-weight: 600; text-align: left; }
    th:first-child { border-radius: var(--radius-control) 0 0 var(--radius-control); }
    th:last-child { border-radius: 0 var(--radius-control) var(--radius-control) 0; }
    td { padding: 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
    tr.row { cursor: pointer; }
    tr.row:hover td { background: var(--subtle); }
    .r { text-align: right; font-variant-numeric: tabular-nums; }
    .no { color: var(--ink); font-weight: 600; text-decoration: none; }
    .no:hover { text-decoration: underline; }
    .name { color: var(--ink); }
    .muted { color: var(--ink-3); font-size: var(--text-xs); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { padding: 0 9px; border-radius: var(--radius-pill); background: var(--tint-teal); color: var(--tint-teal-ink); font-size: var(--text-xs); line-height: 22px; font-weight: 600; }
    .chip.none { background: var(--subtle); color: var(--ink-3); font-weight: 500; }
    ul.cards { display: none; margin: 0; padding: 0; list-style: none; }
    ul.cards li { padding: 14px 0; border-bottom: 1px solid var(--line); }
    ul.cards a { display: flex; flex-direction: column; gap: 4px; color: inherit; text-decoration: none; }
    .top { display: flex; justify-content: space-between; gap: 8px; }
    .more {
      width: 100%; min-height: 44px; margin-top: var(--space-3); border: 1px dashed var(--line-strong); border-radius: var(--radius-control);
      background: transparent; color: var(--ink-2); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    @media (max-width: 720px) {
      table { display: none; }
      ul.cards { display: block; }
    }
  `,
  template: `
    <section class="generate">
      <div>
        <h2>Generate an invoice</h2>
        <p>Make a tax invoice for a client, then send it as a PDF by email or WhatsApp.</p>
      </div>
      <a matButton="filled" routerLink="/invoices/new" aria-label="Generate invoice">
        <mat-icon>add</mat-icon>Generate invoice
      </a>
    </section>

    <section class="card">
      <div class="head">
        <div>
          <h2>All invoices</h2>
          <p class="sub">{{ total() }} {{ total() === 1 ? 'invoice' : 'invoices' }}{{ query() ? ' found' : ' made so far' }}</p>
        </div>
        <label class="search">
          <mat-icon aria-hidden="true">search</mat-icon>
          <input
            type="search"
            placeholder="Search by invoice no., name or client…"
            aria-label="Search invoices"
            [value]="query()"
            (input)="onQuery($event)"
          />
        </label>
      </div>

      @if (error() && !rows().length) {
        <app-error-state title="Couldn't load the invoices" (retry)="load(1)" />
      } @else if (loading() && !rows().length) {
        @for (i of [0, 1, 2, 3]; track i) {
          <app-skeleton height="44px" radius="8px" style="margin-bottom: 8px" />
        }
      } @else if (!rows().length) {
        <app-empty-state
          icon="description"
          [title]="query() ? 'No invoices match' : 'No invoices yet'"
          [message]="query() ? 'Try a different invoice number, name or client.' : 'Use Generate invoice to make your first one.'"
          [bordered]="false"
        />
      } @else {
        <table>
          <thead>
            <tr>
              <th>Invoice no.</th>
              <th>Name</th>
              <th>Client</th>
              <th>Date</th>
              <th class="r">Amount</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr class="row" (click)="open(row)">
                <td><a class="no" [routerLink]="['/invoices', row.id]" (click)="$event.stopPropagation()">{{ row.invoice_no }}</a></td>
                <td class="name">{{ row.title }}</td>
                <td>{{ row.client_name }}</td>
                <td>{{ day(row.invoice_date) }}</td>
                <td class="r">{{ row.total | inr: 'paise' }}</td>
                <td>
                  <span class="chips">
                    @if (row.emailed_at) { <span class="chip">Emailed</span> }
                    @if (row.whatsapp_at) { <span class="chip">WhatsApp</span> }
                    @if (!row.emailed_at && !row.whatsapp_at) { <span class="chip none">Not sent</span> }
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
        <ul class="cards">
          @for (row of rows(); track row.id) {
            <li>
              <a [routerLink]="['/invoices', row.id]">
                <span class="top"><strong>{{ row.invoice_no }}</strong><strong>{{ row.total | inr: 'paise' }}</strong></span>
                <span class="name">{{ row.title }}</span>
                <span class="muted">{{ row.client_name }} · {{ day(row.invoice_date) }}</span>
                <span class="chips">
                  @if (row.emailed_at) { <span class="chip">Emailed</span> }
                  @if (row.whatsapp_at) { <span class="chip">WhatsApp</span> }
                  @if (!row.emailed_at && !row.whatsapp_at) { <span class="chip none">Not sent</span> }
                </span>
              </a>
            </li>
          }
        </ul>
        @if (hasMore() && !loading()) {
          <button type="button" class="more" (click)="load(page + 1)">Load more</button>
        }
      }
    </section>
  `,
})
export class InvoicesListPage {
  private readonly api = inject(InvoicesApi);
  private readonly router = inject(Router);

  protected readonly rows = signal<InvoiceRow[]>([]);
  protected readonly total = signal(0);
  protected readonly query = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly hasMore = signal(false);
  protected page = 1;
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

  protected day(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected open(row: InvoiceRow): void {
    void this.router.navigate(['/invoices', row.id]);
  }

  load(page: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.list(page, this.query().trim()).subscribe({
      next: (res) => {
        this.page = page;
        this.rows.update((rows) => (page === 1 ? res.results : [...rows, ...res.results]));
        this.total.set(res.count);
        this.hasMore.set(!!res.next);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
