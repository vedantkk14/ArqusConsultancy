import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { LedgerDetail, Payment } from '../data/account.models';
import { AccountsApi } from '../data/accounts-api.service';
import { FakeAccountsApi, makeLedger, makePayment } from '../testing/fake-accounts-api';
import { fakeViewport } from '../testing/fake-viewport';
import { LedgerDetailPage } from './ledger-detail-page';

async function setup(opts: { ledger?: LedgerDetail | null; width?: number; payments?: Payment[] } = {}) {
  const ledger = opts.ledger === undefined ? makeLedger(1) : opts.ledger;
  const api = new FakeAccountsApi();
  if (opts.payments) {
    api.paymentRows = opts.payments;
  }
  if (ledger) {
    api.detail = ledger;
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'accounts/ledgers/:id', component: LedgerDetailPage, resolve: { ledger: () => ledger } }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AccountsApi, useValue: api },
      fakeViewport(opts.width ?? 1440),
    ],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Alice', email: 'a@x.com', role: Role.Admin } });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/accounts/ledgers/1', LedgerDetailPage);
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
const byLabel = (root: ParentNode, label: string) => root.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`);
const buttonByText = (root: ParentNode, label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b).includes(label));
const field = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));

describe('LedgerDetailPage', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('shows the money hero, actions with the client name, and the payments', async () => {
    const { el } = await setup();
    expect(text(el.querySelector('.hero'))).toContain('₹1,00,000');
    expect(text(el.querySelector('.hero'))).toContain('₹60,000');
    for (const label of ['Record payment for Client 1', 'Send a reminder to Client 1', 'Revise the total for Client 1']) {
      expect(byLabel(el, label), label).toBeTruthy();
    }
    expect(text(el.querySelector('[aria-labelledby="pay-title"]'))).toContain('RC-2026-000001');
  });

  it('an unfinalized ledger says "Proposed ₹X. Finalize to start collecting." and offers Finalize only', async () => {
    const { el } = await setup({ ledger: makeLedger(1, { finalized: false, state: 'AWAITING_FINALIZATION', allowed_actions: ['finalize'], proposed_amount: '250000.00' }) });
    expect(text(el.querySelector('.hero'))).toContain('Proposed ₹2,50,000. Finalize to start collecting.');
    expect(byLabel(el, 'Finalize Client 1')).toBeTruthy();
    expect(byLabel(el, 'Record payment for')).toBeNull();
  });

  it('project panel: linked project with negative margin, or a convert link', async () => {
    const withProject = await setup({
      ledger: makeLedger(1, { project: { id: 5, name: 'Turf', status: 'RUNNING', sanctioned_budget: '60000.00', spent: '70000.00', planned_margin: '40000.00', live_margin: '-30000.00' } }),
    });
    const panel = withProject.el.querySelector('[aria-labelledby="proj-title"]')!;
    expect(panel.querySelector('a[href="/projects/5"]')).toBeTruthy();
    const neg = [...panel.querySelectorAll('dd')].find((d) => text(d).startsWith('-'));
    expect(neg && text(neg)).toContain('30,000');
    expect(neg!.classList.contains('neg')).toBe(true);
    TestBed.resetTestingModule();
    const without = await setup();
    const link = without.el.querySelector('[aria-labelledby="proj-title"] a[href^="/projects/convert"]');
    expect(link?.getAttribute('href')).toContain('lead=101');
    expect(text(without.el.querySelector('[aria-labelledby="proj-title"]'))).toContain('No project yet.');
  });

  it('shows a friendly not-found state', async () => {
    const { el } = await setup({ ledger: null });
    expect(text(el)).toContain('Ledger not found');
  });

  it('the finalize dialog shows a clear "already finalized" message instead of crashing', async () => {
    const { api, el, harness } = await setup({ ledger: makeLedger(1, { finalized: false, state: 'AWAITING_FINALIZATION', allowed_actions: ['finalize'] }) });
    api.finalizeResult = throwError(() => ({ status: 409, code: 'already_finalized', message: 'x', details: {} }));
    byLabel(el, 'Finalize Client 1')!.click();
    await settle(harness);
    buttonByText(overlay(), 'Confirm')!.click();
    await settle(harness);
    expect(text(overlay())).toContain('This deal is already finalized.');
    expect(buttonByText(overlay(), 'Confirm')!.disabled).toBe(true);
  });

  it('revise total needs a reason and shows the server error inline', async () => {
    const { api, el, harness } = await setup();
    byLabel(el, 'Revise the total for')!.click();
    await settle(harness);
    buttonByText(overlay(), 'Save total')!.click();
    await settle(harness);
    expect(text(overlay())).toContain('Give a reason for the change.');
    api.reviseTotal = () => throwError(() => ({ status: 400, code: 'total_below_received', message: 'The total cannot be lower than the ₹40,000.00 already received.', details: {} }));
    const reason = field<HTMLTextAreaElement>('rv-reason');
    reason.value = 'Scope cut';
    reason.dispatchEvent(new Event('input'));
    buttonByText(overlay(), 'Save total')!.click();
    await settle(harness);
    expect(text(overlay())).toContain('cannot be lower than');
  });

  it('voids a payment through the reason dialog and keeps focus handling', async () => {
    const { api, el, harness } = await setup();
    byLabel(el, 'More actions: ')!.click();
    await settle(harness);
    buttonByText(document.body, 'Void…')!.click();
    await settle(harness);
    buttonByText(overlay(), 'Void payment')!.click();
    await settle(harness);
    expect(text(overlay())).toContain('Give a reason.');
    const reason = field<HTMLTextAreaElement>('rd-reason');
    reason.value = 'Entered twice';
    reason.dispatchEvent(new Event('input'));
    buttonByText(overlay(), 'Void payment')!.click();
    await settle(harness);
    expect(api.actions.at(-1)).toMatchObject({ name: 'voidPayment', args: [1, 'Entered twice'] });
  });

  it('a void payment keeps its row with a "Void" tag and no void action', async () => {
    const { el, harness } = await setup({ payments: [makePayment(1, { is_void: true, void_reason: 'Duplicate' })] });
    expect(text(el.querySelector('.tag.void'))).toBe('Void');
    byLabel(el, 'More actions: ')!.click();
    await settle(harness);
    expect(buttonByText(document.body, 'Void…')).toBeUndefined();
  });

  it('the proof viewer opens and gives focus back to the button when it closes', async () => {
    const { el, harness } = await setup();
    const trigger = byLabel(el, 'View proof')!;
    trigger.focus();
    trigger.click();
    await settle(harness);
    expect(overlay().querySelector('app-proof-viewer')).toBeTruthy();
    expect(overlay().querySelector('img[alt="Payment proof image"]')).toBeTruthy();
    buttonByText(overlay(), 'Close')!.click();
    await settle(harness);
    await wait(400);
    expect(overlay().querySelector('app-proof-viewer')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('the record-payment dialog opens locked to this client', async () => {
    const { el, harness } = await setup();
    byLabel(el, 'Record payment for Client 1')!.click();
    await settle(harness);
    await wait();
    expect(text(overlay())).toContain('Record payment');
    expect(text(overlay().querySelector('.picked-client'))).toContain('Client 1');
    expect(overlay().querySelector('.picked-client button')).toBeNull();
  });

  it('phones get the sticky action bar with the client name in each button', async () => {
    const { el } = await setup({ width: 390 });
    const bar = el.querySelector('nav.mbar')!;
    expect(bar).toBeTruthy();
    expect(byLabel(bar, 'Record payment for Client 1')).toBeTruthy();
    expect(byLabel(bar, 'More actions for Client 1')).toBeTruthy();
  });
});
