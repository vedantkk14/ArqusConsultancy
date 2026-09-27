import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { ImportReport } from '../../data/lead.models';
import { ImportDialog } from './import-dialog';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const report = (patch: Partial<ImportReport> = {}): ImportReport => ({
  dry_run: true,
  total: 3,
  ready: 1,
  created: 0,
  duplicate_count: 1,
  error_count: 1,
  duplicates: [{ row: 3, name: 'Dup', phone: '9876543210', reason: 'A lead with this phone number already exists.' }],
  errors: [{ row: 4, name: 'Asha', phone: '123', reason: 'Enter a valid mobile number, e.g. 98765 43210.' }],
  ...patch,
});

function setup() {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MatDialogRef, useValue: { close } }],
  });
  const fixture = TestBed.createComponent(ImportDialog);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController), close };
}

const pick = (el: HTMLElement, file: File) => {
  const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new Event('change'));
};

describe('ImportDialog', () => {
  it('rejects other file types before uploading', () => {
    const { el, fixture, http } = setup();
    pick(el, new File(['x'], 'leads.pdf'));
    fixture.detectChanges();
    expect(text(el.querySelector('.error'))).toContain('Excel');
    http.expectNone((r) => r.url.endsWith('/leads/import'));
  });

  it('previews first, then imports and closes with the created count', () => {
    const { el, fixture, http, close } = setup();
    pick(el, new File(['x'], 'leads.xlsx'));
    const preview = http.expectOne((r) => r.url.endsWith('/leads/import'));
    expect(preview.request.params.get('dry_run')).toBe('1');
    preview.flush(report());
    fixture.detectChanges();
    expect([...el.querySelectorAll('.tile b')].map(text)).toEqual(['1', '1', '1']);
    expect(text(el)).toContain('Row 4');
    expect(text(el)).toContain('Row 3');
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Import 1 lead')!.click();
    const real = http.expectOne((r) => r.url.endsWith('/leads/import'));
    expect(real.request.params.has('dry_run')).toBe(false);
    real.flush(report({ dry_run: false, created: 1 }));
    fixture.detectChanges();
    expect(text(el)).toContain('1 lead imported');
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === 'Done')!.click();
    expect(close).toHaveBeenCalledWith(1);
  });

  it('shows a server problem with the file and lets you retry', () => {
    const { el, fixture, http } = setup();
    pick(el, new File(['x'], 'leads.xlsx'));
    http.expectOne((r) => r.url.endsWith('/leads/import')).flush(
      { error: { code: 'validation_error', message: 'x', details: { file: ['Missing column: Phone.'] } } },
      { status: 400, statusText: 'Bad' },
    );
    fixture.detectChanges();
    expect(text(el.querySelector('.error'))).toBe('Missing column: Phone.');
    expect(el.querySelector('.drop')).not.toBeNull();
  });
});
