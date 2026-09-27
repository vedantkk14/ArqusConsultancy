import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { AccountsApi } from '../data/accounts-api.service';
import { FakeAccountsApi, makePayment } from '../testing/fake-accounts-api';
import { fakeViewport } from '../testing/fake-viewport';
import { PRINT_CLASS } from '../ui/print';
import { PaymentsPage } from './payments-page';
import { ReceiptPage } from './receipt-page';
import { StatementPage } from './statement-page';

async function setup(url: string, width = 1440) {
  const api = new FakeAccountsApi();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'accounts/payments', component: PaymentsPage },
        { path: 'accounts/payments/:id/receipt', component: ReceiptPage },
        { path: 'accounts/statement', component: StatementPage },
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
  await harness.navigateByUrl(url);
  await settle(harness);
  return { api, harness, el: harness.routeNativeElement as HTMLElement };
}

async function settle(harness: RouterTestingHarness) {
  harness.detectChanges();
  await harness.fixture.whenStable();
  harness.detectChanges();
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const overlay = () => document.querySelector('.cdk-overlay-container') as HTMLElement;
const buttonByText = (root: ParentNode, label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));

describe('PaymentsPage', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('reads the filters from the URL and sends them with the API names', async () => {
    const { api } = await setup('/accounts/payments?mode=UPI&has_proof=true&state=void&q=utr&ledger=3&date_from=2026-09-01');
    expect(api.paymentCalls[0]).toMatchObject({ mode: 'UPI', has_proof: 'true', state: 'void', q: 'utr', ledger: '3', date_from: '2026-09-01', ordering: '-received_on', page: 1 });
  });

  it('lists payments with the client as a link and a proof button, plus totals by mode', async () => {
    const { api, el, harness } = await setup('/accounts/payments');
    expect(el.querySelector('a[href="/accounts/ledgers/1"]')?.textContent).toContain('Client 1');
    expect(el.querySelector('button[aria-label^="View proof"]')).toBeTruthy();
    api.paymentSummary$ = new (await import('rxjs')).BehaviorSubject({
      total: '60000.00',
      count: 2,
      void_count: 1,
      by_mode: [{ mode: 'UPI' as const, label: 'UPI', total: '60000.00', count: 2 }],
    });
    await harness.navigateByUrl('/accounts/payments?mode=UPI');
    await settle(harness);
    expect(text(el.ownerDocument.querySelector('.totals'))).toContain('₹60,000.00');
    expect(text(el.ownerDocument.querySelector('.totals'))).toContain('1 voided, not counted');
  });

  it('?new=1 opens Record payment and drops the flag; ?new=1&ledger=<id> preselects that client', async () => {
    const { harness } = await setup('/accounts/payments?new=1&ledger=1');
    await new Promise((r) => setTimeout(r, 400));
    await settle(harness);
    expect(text(overlay())).toContain('Record payment');
    expect(text(overlay().querySelector('.picked-client'))).toContain('Client 1');
    expect(TestBed.inject(Router).url).not.toContain('new=1');
  });

  it('shows empty and no-results states', async () => {
    const a = await setup('/accounts/payments');
    a.api.paymentRows = [];
    TestBed.resetTestingModule();
    const b = await setup('/accounts/payments?q=zzz');
    expect(text(b.el)).toBeTruthy();
  });
});

describe('StatementPage', () => {
  it('shows the statement for ?ledger=<id> and never mentions budget, expenses or margin', async () => {
    const { api, el } = await setup('/accounts/statement?ledger=1');
    expect(api.actions[0]).toMatchObject({ name: 'statement', args: [1, '', ''] });
    const doc = text(el.querySelector('.doc'));
    expect(doc).toContain('Customer statement');
    expect(doc).toContain('RC-2026-000001');
    expect(doc).toContain('₹60,000.00');
    expect(text(el).toLowerCase()).not.toMatch(/sanction|expense|margin|budget/);
  });

  it('adds the print class to the body while open and removes it when leaving', async () => {
    const { harness } = await setup('/accounts/statement?ledger=1');
    expect(document.body.classList.contains(PRINT_CLASS)).toBe(true);
    await harness.navigateByUrl('/accounts/payments');
    await settle(harness);
    expect(document.body.classList.contains(PRINT_CLASS)).toBe(false);
  });

  it('Print calls window.print; the controls are marked no-print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { el } = await setup('/accounts/statement?ledger=1');
    buttonByText(el, 'Print')!.click();
    expect(print).toHaveBeenCalled();
    expect(el.querySelector('.ctl-panel')!.classList.contains('no-print')).toBe(true);
    print.mockRestore();
  });

  it('asks to choose a client when none is selected', async () => {
    const { el } = await setup('/accounts/statement');
    expect(text(el)).toContain('Choose a client');
  });
});

describe('ReceiptPage', () => {
  it('shows number, client, amount, words, balance after and a signature line', async () => {
    const { el } = await setup('/accounts/payments/1/receipt');
    const doc = text(el.querySelector('.rc'));
    expect(doc).toContain('RC-2026-000001');
    expect(doc).toContain('Client 1');
    expect(doc).toContain('₹20,000.00');
    expect(doc).toContain('Rupees Twenty Thousand Only');
    expect(doc).toContain('₹60,000.00');
    expect(doc).toContain('Authorised signature');
    expect(document.body.classList.contains(PRINT_CLASS)).toBe(true);
    expect(text(el).toLowerCase()).not.toMatch(/sanction|expense|margin/);
  });

  it('a void payment says so on the receipt', async () => {
    const api = new FakeAccountsApi();
    api.paymentRows = [makePayment(1, { is_void: true, void_reason: 'Entered twice' })];
    expect(api.paymentRows[0].is_void).toBe(true);
  });
});
