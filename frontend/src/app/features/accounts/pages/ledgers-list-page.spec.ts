import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { findNavItem } from '../../../core/config/route-helpers';
import { Role } from '../../../core/models';
import { EMPTY_FILTERS } from '../data/account.models';
import { AccountsApi } from '../data/accounts-api.service';
import { filtersFromQuery, listInsight, toQuery } from '../data/ledgers-list.store';
import { ACCOUNTS_ROUTES } from '../accounts.routes';
import { FakeAccountsApi, SUMMARY, makeRow, page } from '../testing/fake-accounts-api';
import { fakeViewport } from '../testing/fake-viewport';
import { LedgersListPage } from './ledgers-list-page';

async function setup(url = '/accounts/ledgers', width = 1440) {
  const api = new FakeAccountsApi();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'accounts/ledgers', component: LedgersListPage, data: { mode: 'all' } },
        { path: 'accounts/pending', component: LedgersListPage, data: { mode: 'pending' } },
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AccountsApi, useValue: api },
      fakeViewport(width),
    ],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Alice', email: 'a@x.com', role: Role.Admin } });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, LedgersListPage);
  const el = harness.routeNativeElement as HTMLElement;
  const resolve = (rows = [makeRow(1), makeRow(2, { state: 'UNPAID', received: '0.00', outstanding: '100000.00', is_overdue: true, days_since: 40 })], count?: number) => {
    api.pending.next(page(rows, count));
    harness.detectChanges();
  };
  return { api, harness, el, resolve };
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const buttonByText = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));

describe('LedgersListPage', () => {
  it('reads filters from the URL and sends them with the API names', async () => {
    const { api } = await setup('/accounts/ledgers?state=PARTIAL&q=acme&overdue=true&aging=90%2B&ordering=client');
    expect(api.ledgerCalls[0]).toMatchObject({ state: 'PARTIAL', q: 'acme', overdue: 'true', aging: '90+', ordering: 'client', page: 1 });
  });

  it('lands the dashboard link ?overdue=true on the filtered list and shows the toggle pressed', async () => {
    const { api, el } = await setup('/accounts/pending?overdue=true');
    expect(api.ledgerCalls[0]).toMatchObject({ overdue: 'true', has_balance: 'true', ordering: '-days_since' });
    expect(text(el.querySelector('.chips [aria-pressed=true]'))).toContain('Overdue only');
  });

  it('writes a chip click back to the URL and reloads', async () => {
    const { api, el, resolve, harness } = await setup();
    resolve();
    buttonByText(el, 'Paid')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/accounts/ledgers?state=PAID');
    expect(api.ledgerCalls.at(-1)).toMatchObject({ state: 'PAID' });
  });

  it('shows skeletons, then rows; the insight skips zero parts', async () => {
    const { el, resolve } = await setup();
    expect(el.querySelectorAll('app-ledger-rows app-skeleton').length).toBeGreaterThan(0);
    resolve();
    expect(el.querySelectorAll('app-ledger-rows a.stretch').length).toBe(2);
    expect(text(el.querySelector('.count'))).toBe('2 ledgers');
    expect(text(el.querySelector('.insight'))).toBe('2 clients overdue · 5 with a balance · 1 awaiting finalization');
    expect(listInsight({ ...SUMMARY, overdue_clients: 0, awaiting_finalization: 0 })).toBe('5 with a balance');
    expect(listInsight({ ...SUMMARY, overdue_clients: 0, awaiting_finalization: 0, clients_with_balance: 0 })).toBe('Every client is fully paid.');
  });

  it('summary strip shows total, received, outstanding and the collection rate', async () => {
    const { el, resolve } = await setup();
    resolve();
    const strip = text(el.querySelector('.strip'));
    expect(strip).toContain('₹30L');
    expect(strip).toContain('₹12L');
    expect(strip).toContain('40.0%');
  });

  it('pending mode adds clickable aging segments that write ?aging=', async () => {
    const { api, el, resolve, harness } = await setup('/accounts/pending');
    resolve();
    const seg = [...el.querySelectorAll<HTMLButtonElement>('.aging .seg')].find((b) => text(b).includes('90+'))!;
    seg.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('aging=90%2B');
    expect(api.ledgerCalls.at(-1)).toMatchObject({ aging: '90+', has_balance: 'true' });
  });

  it('shows an error with retry when the first load fails', async () => {
    const { api, el, harness } = await setup();
    api.pending.error({ status: 500, code: 'server_error', message: 'x', details: {} });
    harness.detectChanges();
    expect(el.querySelector('app-error-state')).toBeTruthy();
    buttonByText(el, 'Try again')!.click();
    expect(api.ledgerCalls.length).toBe(2);
  });

  it('empty states: no ledgers, nothing pending, and no results with Clear filters', async () => {
    const a = await setup();
    a.resolve([]);
    expect(text(a.el)).toContain('No ledgers yet');
    TestBed.resetTestingModule();
    const b = await setup('/accounts/pending');
    b.resolve([]);
    expect(text(b.el)).toContain('Nothing pending');
    expect(text(b.el)).toContain('Every client is fully paid.');
    TestBed.resetTestingModule();
    const c = await setup('/accounts/ledgers?q=zzz');
    c.resolve([]);
    expect(text(c.el)).toContain('No ledgers match these filters');
    expect(buttonByText(c.el, 'Clear filters')).toBeTruthy();
  });

  it('rows offer Finalize for an unfinalized ledger and Record payment for one with a balance', async () => {
    const { el, resolve } = await setup();
    resolve([makeRow(1, { finalized: false, state: 'AWAITING_FINALIZATION' }), makeRow(2), makeRow(3, { state: 'PAID', outstanding: '0.00' })]);
    expect(el.querySelector('button[aria-label="Finalize Client 1"]')).toBeTruthy();
    expect(el.querySelector('button[aria-label="Record payment for Client 2"]')).toBeTruthy();
    expect(el.querySelector('button[aria-label="Record payment for Client 3"]')).toBeNull();
  });

  it('a row reminder opens WhatsApp with the returned link', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { api, el, resolve } = await setup();
    resolve();
    (el.querySelector('button[aria-label="Send a reminder to Client 1"]') as HTMLButtonElement).click();
    expect(api.actions[0]).toMatchObject({ name: 'reminder', args: [1] });
    expect(open).toHaveBeenCalledWith('https://wa.me/919800000001?text=Hello', '_blank', 'noopener');
    open.mockRestore();
  });

  it('phones get stacked cards and a single Filters button', async () => {
    const { el, resolve } = await setup('/accounts/ledgers', 390);
    resolve();
    expect(el.querySelectorAll('app-ledger-rows li.card').length).toBe(2);
    expect(buttonByText(el, 'Filters')).toBeTruthy();
  });
});

describe('ledger list helpers', () => {
  it('maps filters to the API query and back', () => {
    expect(toQuery('all', { ...EMPTY_FILTERS, state: 'PAID' })).toEqual({ state: 'PAID', ordering: '-created_at' });
    expect(toQuery('pending', { ...EMPTY_FILTERS })).toEqual({ has_balance: 'true', ordering: '-days_since' });
    expect(filtersFromQuery((k) => (k === 'aging' ? '90 ' : null)).aging).toBe('90+');
  });
});

describe('accounts routes', () => {
  it('every Accounts page is admin only', () => {
    expect(findNavItem('/accounts')?.roles).toEqual([Role.Admin]);
    for (const route of ACCOUNTS_ROUTES.filter((r) => r.path)) {
      const roles = route.data?.['roles'] as Role[];
      expect(roles, route.path).toEqual([Role.Admin]);
    }
    for (const child of findNavItem('/accounts')!.children!) {
      expect(child.roles, child.route).toEqual([Role.Admin]);
    }
  });
});

it('the fake summary is a plain observable', () => {
  let got = false;
  of(SUMMARY).subscribe(() => (got = true));
  expect(got).toBe(true);
});
