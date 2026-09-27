import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Subject, firstValueFrom, isObservable, of } from 'rxjs';
import { LeadDetail } from '../data/lead.models';
import { LeadsApi } from '../data/leads-api.service';
import { unsavedChangesGuard } from '../pages/lead-new-page';
import { FakeLeadsApi, makeLead } from '../testing/fake-leads-api';
import { StatusDialog } from './dialogs/status-dialog';
import { LeadForm } from './lead-form';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function providers(api: FakeLeadsApi, extra: unknown[] = []) {
  return [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: LeadsApi, useValue: api }, ...extra];
}

describe('StatusDialog', () => {
  function open(to: 'WON' | 'LOST', proposed: string | null = null) {
    const api = new FakeLeadsApi();
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: providers(api, [
        { provide: MAT_DIALOG_DATA, useValue: { lead: { id: 5, name: 'Rahul', proposed_amount: proposed }, to } },
        { provide: MatDialogRef, useValue: { close } },
      ]),
    });
    const fixture = TestBed.createComponent(StatusDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const submit = () => {
      el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
      fixture.detectChanges();
    };
    return { api, close, el, fixture, submit };
  }

  it('Won needs a proposed value and says what happens next', () => {
    const { api, el, submit } = open('WON');
    expect(text(el)).toContain("This creates the client's account ledger and notifies the admin.");
    submit();
    expect(text(el)).toContain('Enter the proposed value.');
    expect(api.statusCalls).toEqual([]);
  });

  it('Won with a prefilled value sends it as a string', () => {
    const { api, close, submit } = open('WON', '250000.00');
    submit();
    expect(api.statusCalls).toEqual([{ id: 5, body: { status: 'WON', proposed_amount: '250000.00' } }]);
    expect(close).toHaveBeenCalled();
  });

  it('Lost needs a reason', async () => {
    const { api, el, fixture, submit } = open('LOST');
    submit();
    expect(text(el)).toContain('Choose why this lead was lost.');
    await fixture.whenStable();
    const select = el.querySelector<HTMLSelectElement>('#sd-reason')!;
    select.value = 'PRICE';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    submit();
    expect(api.statusCalls[0].body).toMatchObject({ status: 'LOST', lost_reason: 'PRICE' });
  });

  it('shows server errors inline', () => {
    const { api, el, submit } = open('WON', '100');
    const failing = new Subject<LeadDetail>();
    api.statusResult = failing;
    submit();
    failing.error({ status: 400, code: 'invalid_transition', message: 'This status change is not allowed.', details: {} });
    TestBed.tick();
    expect(text(el)).toContain('This status change is not allowed.');
  });
});

describe('LeadForm duplicate warning', () => {
  it('warns on phone blur and then saves with force', () => {
    const api = new FakeLeadsApi();
    api.duplicate = { id: 4, name: 'Rahul Sharma', status: 'CONTACTED', assigned_to_name: 'Eva Exec' };
    const created: unknown[] = [];
    Object.assign(api, {
      create: (body: unknown) => {
        created.push(body);
        return of(makeLead(10));
      },
    });
    TestBed.configureTestingModule({ providers: providers(api) });
    const fixture = TestBed.createComponent(LeadForm);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
    };
    type('#lf-name', 'Rahul S');
    type('#lf-phone', '98765 43210');
    fixture.detectChanges();
    expect(text(el.querySelector('.dup'))).toContain('This number is already lead Rahul Sharma (Contacted, Eva Exec)');

    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    expect(created[0]).toMatchObject({ name: 'Rahul S', phone: '+919876543210', force: true });
  });

  it('shows field errors on submit', () => {
    TestBed.configureTestingModule({ providers: providers(new FakeLeadsApi()) });
    const fixture = TestBed.createComponent(LeadForm);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
    expect(text(el.querySelector('#lf-name-err'))).toBe("Enter the lead's name.");
    expect(el.querySelector('#lf-name')!.getAttribute('aria-describedby')).toBe('lf-name-err');
  });
});

describe('unsavedChangesGuard', () => {
  async function run(dirty: boolean, confirm: boolean) {
    const dialog = { open: vi.fn(() => ({ afterClosed: () => of(confirm) })) };
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: dialog }] });
    const result = TestBed.runInInjectionContext(() =>
      unsavedChangesGuard({ hasUnsavedChanges: () => dirty }, null as never, null as never, null as never),
    );
    const value = isObservable(result) ? await firstValueFrom(result) : result;
    return { value, dialog };
  }

  it('lets a clean form go without asking', async () => {
    const { value, dialog } = await run(false, false);
    expect(value).toBe(true);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('asks when dirty and follows the answer', async () => {
    expect((await run(true, false)).value).toBe(false);
    TestBed.resetTestingModule();
    expect((await run(true, true)).value).toBe(true);
  });
});
