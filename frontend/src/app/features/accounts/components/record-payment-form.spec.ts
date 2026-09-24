import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AccountsApi, UploadEvent } from '../data/accounts-api.service';
import { OPTION, FakeAccountsApi, makePayment } from '../testing/fake-accounts-api';
import { RecordPaymentForm, proofProblem } from './record-payment-form';

async function setup(opts: { ledger?: typeof OPTION | null; locked?: boolean } = {}) {
  const api = new FakeAccountsApi();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AccountsApi, useValue: api }],
  });
  const fixture: ComponentFixture<RecordPaymentForm> = TestBed.createComponent(RecordPaymentForm);
  fixture.componentRef.setInput('ledger', opts.ledger === undefined ? OPTION : opts.ledger);
  fixture.componentRef.setInput('locked', opts.locked ?? false);
  const saved: unknown[] = [];
  fixture.componentInstance.saved.subscribe((p) => saved.push(p));
  await flush(fixture); // let ngModel finish its first (asynchronous) write before anything is typed
  const el = fixture.nativeElement as HTMLElement;
  return { api, fixture, el, saved };
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const $ = <T extends HTMLElement>(el: ParentNode, sel: string) => el.querySelector<T>(sel)!;

async function flush(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function type(fixture: ComponentFixture<unknown>, sel: string, value: string) {
  const input = $<HTMLInputElement>(fixture.nativeElement, sel);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await flush(fixture);
}

async function submit(fixture: ComponentFixture<unknown>) {
  $<HTMLButtonElement>(fixture.nativeElement, 'button[type=submit]').click();
  await flush(fixture);
}

describe('RecordPaymentForm', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the outstanding balance and "Fill balance" fills it in', async () => {
    const { fixture, el } = await setup();
    expect(text(el.querySelector('.out'))).toContain('Outstanding ₹60,000');
    (el.querySelector('.out button.fill') as HTMLButtonElement).click();
    await flush(fixture);
    expect(($(el, '#rp-amount') as HTMLInputElement).value).toBe('60,000.00');
  });

  it('validates the amount, the reference (not for cash) and the date before sending', async () => {
    const { api, fixture, el } = await setup();
    await submit(fixture);
    expect(text(el)).toContain('Enter the amount.');
    expect(text(el)).toContain('Enter the bank reference (utr).');
    expect(document.activeElement?.id).toBe('rp-amount');
    expect(api.actions.length).toBe(0);
    // cash needs no reference
    ($(el, '#rp-mode-CASH') as HTMLInputElement).click();
    await flush(fixture);
    expect(el.querySelector('#rp-reference')).toBeNull();
    await type(fixture, '#rp-amount', '500');
    await submit(fixture);
    expect(api.actions[0].name).toBe('addPayment');
    expect(api.actions[0].args[1]).toMatchObject({ amount: '500', mode: 'CASH', reference: '' });
  });

  it('the reference label follows the mode', async () => {
    const { fixture, el } = await setup();
    for (const [mode, label] of [['UPI', 'UPI transaction ID'], ['CHEQUE', 'Cheque number'], ['CARD', 'Card approval code']]) {
      ($(el, `#rp-mode-${mode}`) as HTMLInputElement).click();
      await flush(fixture);
      expect(text(el.querySelector('label[for=rp-reference]'))).toBe(label);
    }
  });

  it('rejects a wrong file type and an oversize file, accepts a valid one with a preview', async () => {
    expect(proofProblem({ name: 'a.txt', type: 'text/plain', size: 10 })).toBe('Upload a JPG, PNG, WebP or PDF proof.');
    expect(proofProblem({ name: 'a.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBe('The proof is larger than 5 MB.');
    expect(proofProblem({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBe('');
    const { fixture, el } = await setup();
    const chooser = el.querySelectorAll<HTMLInputElement>('input[type=file]')[1];
    const pick = async (file: File) => {
      Object.defineProperty(chooser, 'files', { value: [file], configurable: true });
      chooser.dispatchEvent(new Event('change'));
      await flush(fixture);
    };
    await pick(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(text(el)).toContain('Upload a JPG, PNG, WebP or PDF proof.');
    await pick(new File(['x'], 'slip.pdf', { type: 'application/pdf' }));
    expect(text(el)).toContain('slip.pdf');
    (el.querySelector('button[aria-label="Remove proof"]') as HTMLButtonElement).click();
    await flush(fixture);
    expect(text(el)).not.toContain('slip.pdf');
  });

  it('overpayment shows the outstanding balance inline', async () => {
    const { api, fixture, el } = await setup();
    api.uploadResult = throwError(() => ({ status: 409, code: 'overpayment', message: 'x', details: { outstanding: '60000.00' } }));
    await type(fixture, '#rp-amount', '70000');
    await type(fixture, '#rp-reference', 'UTR9');
    await submit(fixture);
    expect(text(el)).toContain('This is more than the outstanding balance of ₹60,000.');
  });

  it('not_finalized shows a clear message', async () => {
    const { api, fixture, el } = await setup();
    api.uploadResult = throwError(() => ({ status: 409, code: 'not_finalized', message: 'x', details: {} }));
    await type(fixture, '#rp-amount', '10');
    await type(fixture, '#rp-reference', 'UTR9');
    await submit(fixture);
    expect(text(el)).toContain('Finalize the deal amount before recording payments.');
  });

  it('duplicate_payment asks for confirmation and "Record anyway" resends with confirm_duplicate', async () => {
    const { api, fixture, el, saved } = await setup();
    api.uploadResult = throwError(() => ({ status: 409, code: 'duplicate_payment', message: 'x', details: {} }));
    await type(fixture, '#rp-amount', '10');
    await type(fixture, '#rp-reference', 'UTR9');
    await submit(fixture);
    expect(text(el)).toContain('The same payment was just recorded.');
    api.uploadResult = of({ kind: 'done', payment: makePayment(7) } as UploadEvent);
    (el.querySelector('.dup button') as HTMLButtonElement).click();
    await flush(fixture);
    expect(api.actions.at(-1)!.args[1]).toMatchObject({ confirm_duplicate: true });
    expect(saved.length).toBe(1);
  });

  it('ignores a second submit while uploading and shows progress', async () => {
    const { api, fixture, el, saved } = await setup();
    const upload = new Subject<UploadEvent>();
    api.uploadResult = upload;
    await type(fixture, '#rp-amount', '10');
    await type(fixture, '#rp-reference', 'UTR9');
    const button = $<HTMLButtonElement>(el, 'button[type=submit]');
    button.click();
    button.click();
    await flush(fixture);
    expect(api.actions.filter((a) => a.name === 'addPayment').length).toBe(1);
    expect(button.disabled).toBe(true);
    upload.next({ kind: 'progress', percent: 40 });
    await flush(fixture);
    expect(text(button)).toContain('Uploading… 40%');
    upload.next({ kind: 'done', payment: makePayment(8) });
    upload.complete();
    await flush(fixture);
    expect(saved.length).toBe(1);
  });

  it('maps server field errors onto the fields and focuses the first invalid one', async () => {
    const { api, fixture, el } = await setup();
    api.uploadResult = throwError(() => ({ status: 400, code: 'validation_error', message: 'x', details: { received_on: ['The date cannot be in the future.'] } }));
    await type(fixture, '#rp-amount', '10');
    await type(fixture, '#rp-reference', 'UTR9');
    await submit(fixture);
    expect(text(el)).toContain('The date cannot be in the future.');
    expect(document.activeElement?.id).toBe('rp-date');
  });

  it('without a preselected client it searches clients with a balance and picks one', async () => {
    const { fixture, el } = await setup({ ledger: null });
    await flush(fixture);
    await new Promise((r) => setTimeout(r, 400));
    await flush(fixture);
    expect(text(el.querySelector('.opts'))).toContain('Client 1');
    (el.querySelector('.opts button') as HTMLButtonElement).click();
    await flush(fixture);
    expect(text(el.querySelector('.picked-client'))).toContain('Client 1');
    expect(text(el.querySelector('.out'))).toContain('Outstanding ₹60,000');
  });

  it('a locked ledger (opened from its own page) has no "Change" button', async () => {
    const { el } = await setup({ locked: true });
    expect(el.querySelector('.picked-client button')).toBeNull();
  });
});
