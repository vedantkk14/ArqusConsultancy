import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Invoice, InvoiceRow } from './data/invoice.models';
import { InvoicesApi } from './data/invoices-api.service';
import { EmailInvoiceDialog, WhatsAppInvoiceDialog } from './components/send-invoice-dialogs';
import { InvoiceDetailPage } from './pages/invoice-detail-page';
import { InvoiceFormPage } from './pages/invoice-form-page';
import { InvoicesListPage } from './pages/invoices-list-page';

const ROW: InvoiceRow = {
  id: 5,
  invoice_no: '2026-27/200',
  title: 'Cycle track at Harmony',
  client_name: 'HARMONY INFRA',
  client_email: 'accounts@harmony.example',
  client_phone: '9812345678',
  invoice_date: '2026-08-24',
  total: '37333.00',
  emailed_at: null,
  whatsapp_at: null,
  created_at: '2026-08-24T10:00:00Z',
};

const INVOICE: Invoice = {
  ...ROW,
  client_address: 'Surat',
  client_gstin: '24AAQFH0005A1Z6',
  tax_type: 'IGST',
  gst_percent: '18.00',
  subtotal: '31638.00',
  tax_amount: '5695.00',
  round_off: '0.00',
  items: [{ particulars: 'Track', hsn: '3209', quantity: '100.0000', rate: '316.38', unit: 'Sq.ft', amount: '31638.00' }],
  figures: { cgst: '0.00', sgst: '0.00' },
  amount_in_words: 'Thirty Seven Thousand Three Hundred And Thirty Three',
  company: {
    name: 'ARQUS SPORTS CONSULTANCY',
    short_name: 'Arqus Sports Consultancy',
    address_lines: ['104, Zenith Complex, Narveer Tanaji Wadi,', 'Shivaji Nagar, Pune-4110005'],
    phone: '+91- 8237248667/7875304506',
    email: 'arqussportsconsultancy@gmail.com',
    website: 'www.arqussportsconsultancy.com',
    pan: 'CPEPD8900B',
    gstin: '27CPEPD8900B1ZC',
  },
};

function baseApi() {
  return {
    list: vi.fn<InvoicesApi['list']>(() => of({ count: 1, next: null, previous: null, results: [ROW] })),
    get: vi.fn<InvoicesApi['get']>(() => of(INVOICE)),
    create: vi.fn<InvoicesApi['create']>(() => of({ ...INVOICE, id: 9 })),
    update: vi.fn<InvoicesApi['update']>(() => of(INVOICE)),
    pdf: vi.fn<InvoicesApi['pdf']>(() => of(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))),
    email: vi.fn<InvoicesApi['email']>(() =>
      of({ sent_to: 'accounts@harmony.example', invoice: { ...INVOICE, emailed_at: '2026-08-24T11:00:00Z' } }),
    ),
    whatsapp: vi.fn<InvoicesApi['whatsapp']>(() =>
      of({ url: 'https://wa.me/919812345678?text=x', text: 'x', link: 'l', invoice: INVOICE }),
    ),
  };
}

function fakeApi(over: Partial<ReturnType<typeof baseApi>> = {}) {
  return { ...baseApi(), ...over };
}

function setup<T>(component: new () => T, api: ReturnType<typeof fakeApi>, id?: number) {
  const snack = { open: vi.fn() };
  const dialog = { open: vi.fn(() => ({ afterClosed: () => of(undefined) })) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: InvoicesApi, useValue: api },
      { provide: MatSnackBar, useValue: snack },
      { provide: MatDialog, useValue: dialog },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id: String(id) } : {}) } } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, snack, dialog, navigate };
}

const flush = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('InvoicesListPage', () => {
  it('puts the Generate invoice button first, then lists every invoice', () => {
    const { el } = setup(InvoicesListPage, fakeApi());
    const generate = el.querySelector('a[aria-label="Generate invoice"]') as HTMLAnchorElement;
    expect(generate.getAttribute('href')).toBe('/invoices/new');
    const text = el.textContent ?? '';
    expect(text.indexOf('Generate an invoice')).toBeLessThan(text.indexOf('All invoices'));
    expect(text).toContain('2026-27/200');
    expect(text).toContain('Cycle track at Harmony');
    expect(text).toContain('HARMONY INFRA');
    expect(text).toContain('Not sent');
  });

  it('shows what has been sent', () => {
    const sent = { ...ROW, emailed_at: '2026-08-25T10:00:00Z', whatsapp_at: '2026-08-25T11:00:00Z' };
    const api = fakeApi({ list: vi.fn(() => of({ count: 1, next: null, previous: null, results: [sent] })) });
    const { el } = setup(InvoicesListPage, api);
    expect(el.textContent).toContain('Emailed');
    expect(el.textContent).toContain('WhatsApp');
  });

  it('searches as you type and shows an empty state', async () => {
    vi.useFakeTimers();
    const none = vi.fn<InvoicesApi['list']>((_page, q) =>
      of({ count: 0, next: null, previous: null, results: q ? [] : [ROW] }),
    );
    const { fixture, el } = setup(InvoicesListPage, fakeApi({ list: none }));
    const box = el.querySelector('input[aria-label="Search invoices"]') as HTMLInputElement;
    box.value = 'zzz';
    box.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    vi.useRealTimers();
    await flush(fixture);
    expect(none).toHaveBeenLastCalledWith(1, 'zzz');
    expect(el.textContent).toContain('No invoices match');
  });

  it('says so when there are no invoices yet', () => {
    const api = fakeApi({ list: vi.fn(() => of({ count: 0, next: null, previous: null, results: [] })) });
    const { el } = setup(InvoicesListPage, api);
    expect(el.textContent).toContain('No invoices yet');
  });
});

describe('InvoiceFormPage', () => {
  async function fill(fixture: Parameters<typeof flush>[0], el: HTMLElement, id: string, value: string) {
    await fixture.whenStable();
    const input = el.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }
  const submit = async (fixture: Parameters<typeof flush>[0], el: HTMLElement) => {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await flush(fixture);
  };

  it('has a blank GST box and no system-made invoice number', () => {
    const { el } = setup(InvoiceFormPage, fakeApi());
    expect((el.querySelector('#inv-gst') as HTMLInputElement).value).toBe('');
    expect((el.querySelector('#inv-no') as HTMLInputElement).value).toBe('');
    expect(el.textContent).toContain('Invoice name');
  });

  it('will not save without a number, a client and a described item', async () => {
    const api = fakeApi();
    const { fixture, el } = setup(InvoiceFormPage, api);
    await submit(fixture, el);
    expect(el.textContent).toContain('Enter the invoice number.');
    expect(el.textContent).toContain('Enter the client or company name.');
    expect(el.textContent).toContain('Describe this item.');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('works out the totals live and saves what the admin typed', async () => {
    const api = fakeApi();
    const { fixture, el, navigate } = setup(InvoiceFormPage, api);
    await fill(fixture, el, 'inv-no', '2026-27/201');
    await fill(fixture, el, 'inv-title', 'Cycle track');
    await fill(fixture, el, 'inv-client', 'Harmony Infra');
    await fill(fixture, el, 'it-part-0', 'Acrylic track');
    await fill(fixture, el, 'it-qty-0', '100');
    await fill(fixture, el, 'it-rate-0', '381');
    await fill(fixture, el, 'inv-gst', '18');
    const summary = el.querySelector('.summary')?.textContent ?? '';
    expect(summary).toContain('38,100.00');
    expect(summary).toContain('IGST @ 18%');
    expect(summary).toContain('6,858.00');
    expect(summary).toContain('44,958.00');
    expect(el.textContent).toContain('Forty Four Thousand Nine Hundred And Fifty Eight');
    await submit(fixture, el);
    expect(api.create).toHaveBeenCalledTimes(1);
    const body = (api.create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(body['invoice_no']).toBe('2026-27/201');
    expect(body['title']).toBe('Cycle track');
    expect(body['gst_percent']).toBe('18');
    expect(body['items']).toEqual([{ particulars: 'Acrylic track', hsn: '', quantity: '100', rate: '381', unit: 'Sq.ft' }]);
    expect(navigate).toHaveBeenCalledWith(['/invoices', 9]);
  });

  it('can add and remove items', async () => {
    const { fixture, el } = setup(InvoiceFormPage, fakeApi());
    const add = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Add another item')) as HTMLButtonElement;
    add.click();
    await flush(fixture);
    expect(el.querySelectorAll('.item').length).toBe(2);
    (el.querySelector('button[aria-label="Remove item 2"]') as HTMLButtonElement).click();
    await flush(fixture);
    expect(el.querySelectorAll('.item').length).toBe(1);
  });

  it('shows the server message when the invoice number is taken', async () => {
    const taken = vi.fn(() =>
      throwError(() => ({ code: 'validation_error', message: 'x', details: { invoice_no: ['An invoice with this number already exists.'] } })),
    );
    const { fixture, el } = setup(InvoiceFormPage, fakeApi({ create: taken }));
    await fill(fixture, el, 'inv-no', 'DUP');
    await fill(fixture, el, 'inv-client', 'A');
    await fill(fixture, el, 'it-part-0', 'x');
    await fill(fixture, el, 'it-qty-0', '1');
    await fill(fixture, el, 'it-rate-0', '1');
    await submit(fixture, el);
    expect(el.textContent).toContain('An invoice with this number already exists.');
  });

  it('opens an existing invoice for editing and saves changes', async () => {
    const api = fakeApi();
    const { fixture, el, navigate } = setup(InvoiceFormPage, api, 5);
    await flush(fixture);
    expect((el.querySelector('#inv-no') as HTMLInputElement).value).toBe('2026-27/200');
    expect((el.querySelector('#inv-gst') as HTMLInputElement).value).toBe('18');
    await submit(fixture, el);
    expect(api.update).toHaveBeenCalledWith(5, expect.objectContaining({ invoice_no: '2026-27/200' }));
    expect(navigate).toHaveBeenCalledWith(['/invoices', 5]);
  });
});

describe('InvoiceDetailPage', () => {
  it('shows the invoice, a PDF preview and the send buttons', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const { fixture, el } = setup(InvoiceDetailPage, fakeApi(), 5);
    await flush(fixture);
    expect(el.textContent).toContain('Invoice 2026-27/200');
    expect(el.textContent).toContain('Not sent yet');
    // A clean replica of the page (not the browser's dark PDF viewer), with the numbers and the stamp.
    const paper = el.querySelector('app-invoice-paper') as HTMLElement;
    expect(paper).toBeTruthy();
    expect(el.querySelector('iframe')).toBeNull();
    expect(paper.textContent).toContain('TAX INVOICE');
    expect(paper.textContent).toContain('IGST @ 18%');
    expect(paper.textContent).toContain('37,333.00');
    expect(paper.querySelector('img[src$="arqus-stamp.png"]')).toBeTruthy();
    expect(el.querySelector('[aria-label="Open the PDF full size"]')).toBeTruthy();
    for (const label of ['Send to client by email', 'Send to client on WhatsApp', 'Download PDF', 'Edit invoice']) {
      expect(el.querySelector(`[aria-label="${label}"]`), label).toBeTruthy();
    }
    expect(el.querySelector('a[aria-label="Edit invoice"]')?.getAttribute('href')).toBe('/invoices/5/edit');
  });

  it('opens the email and WhatsApp dialogs with the invoice', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    const { fixture, el, dialog } = setup(InvoiceDetailPage, fakeApi(), 5);
    await flush(fixture);
    (el.querySelector('[aria-label="Send to client by email"]') as HTMLButtonElement).click();
    (el.querySelector('[aria-label="Send to client on WhatsApp"]') as HTMLButtonElement).click();
    expect(dialog.open).toHaveBeenNthCalledWith(1, EmailInvoiceDialog, expect.objectContaining({ data: { invoice: INVOICE } }));
    expect(dialog.open).toHaveBeenNthCalledWith(2, WhatsAppInvoiceDialog, expect.objectContaining({ data: { invoice: INVOICE } }));
  });
});

describe('send dialogs', () => {
  function dialogSetup<T>(component: new () => T, api: ReturnType<typeof fakeApi>, over: Partial<Invoice> = {}) {
    const ref = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: InvoicesApi, useValue: api },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { invoice: { ...INVOICE, ...over } } },
      ],
    });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, ref };
  }

  it('emails the invoice to the client address and closes with the result', async () => {
    const api = fakeApi();
    const { fixture, el, ref } = dialogSetup(EmailInvoiceDialog, api);
    await flush(fixture);
    expect((el.querySelector('#ei-to') as HTMLInputElement).value).toBe('accounts@harmony.example');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await flush(fixture);
    expect(api.email).toHaveBeenCalledWith(5, { to: 'accounts@harmony.example', message: '' });
    expect(ref.close).toHaveBeenCalledWith(expect.objectContaining({ sent_to: 'accounts@harmony.example' }));
  });

  it('asks for an address when the client has none and shows send failures', async () => {
    const api = fakeApi({
      email: vi.fn(() => throwError(() => ({ code: 'invoice_email_failed', message: 'The invoice email could not be sent.', details: {} }))),
    });
    const { fixture, el, ref } = dialogSetup(EmailInvoiceDialog, api, { client_email: '' });
    await flush(fixture);
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await flush(fixture);
    expect(el.textContent).toContain("Enter the client's email address.");
    const input = el.querySelector('#ei-to') as HTMLInputElement;
    input.value = 'a@b.co';
    input.dispatchEvent(new Event('input'));
    await flush(fixture);
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await flush(fixture);
    expect(el.textContent).toContain('could not be sent');
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('opens WhatsApp with the invoice message', async () => {
    const opened = { location: { href: '' }, opener: {} as unknown, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(opened as unknown as Window);
    const api = fakeApi();
    const { fixture, el, ref } = dialogSetup(WhatsAppInvoiceDialog, api);
    await flush(fixture);
    expect((el.querySelector('#wi-phone') as HTMLInputElement).value).toBe('9812345678');
    expect(el.textContent).toContain('works for 30 days');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await flush(fixture);
    expect(api.whatsapp).toHaveBeenCalledWith(5, { phone: '9812345678' });
    expect(opened.location.href).toBe('https://wa.me/919812345678?text=x');
    expect(ref.close).toHaveBeenCalledWith(INVOICE);
  });
});
