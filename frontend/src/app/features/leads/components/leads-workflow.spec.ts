import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Subject, firstValueFrom, isObservable, of } from 'rxjs';
import { LeadDetail } from '../data/lead.models';
import { LeadsApi } from '../data/leads-api.service';
import { unsavedChangesGuard } from '../pages/lead-new-page';
import { FakeLeadsApi, SUMMARY, makeLead } from '../testing/fake-leads-api';
import { StatusDialog } from './dialogs/status-dialog';
import { LeadForm } from './lead-form';
import { LeadsBoard } from './leads-board';

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

describe('LeadsBoard', () => {
  function setup(dialogResult: LeadDetail | undefined) {
    const api = new FakeLeadsApi();
    const dialog = { open: vi.fn(() => ({ afterClosed: () => of(dialogResult) })) };
    TestBed.configureTestingModule({ providers: providers(api, [{ provide: MatDialog, useValue: dialog }]) });
    const fixture = TestBed.createComponent(LeadsBoard);
    fixture.componentRef.setInput('query', { ordering: '-created_at' });
    fixture.componentRef.setInput('summary', SUMMARY);
    fixture.detectChanges();
    return { api, dialog, fixture };
  }

  const columnNames = (fixture: { nativeElement: HTMLElement }, status: string) =>
    [...fixture.nativeElement.querySelectorAll(`section[aria-labelledby="col-${status}"] .nm`)].map(text);

  it('loads one list per column and shows counts from the summary', () => {
    const { api, fixture } = setup(undefined);
    expect(api.listCalls.map((c) => c['status'])).toEqual(['NEW', 'CONTACTED', 'INTERESTED', 'WON', 'LOST']);
    expect(api.listCalls[0]['page_size']).toBe(15);
    expect(text(fixture.nativeElement.querySelector('section[aria-labelledby="col-WON"] header'))).toContain('₹4L');
  });

  it('moving to Won opens the dialog and puts the card back on cancel', () => {
    const { dialog, fixture } = setup(undefined);
    const lead = makeLead(9, { status: 'CONTACTED', allowed_transitions: ['INTERESTED', 'WON', 'LOST'] });
    type Col = { status: string; rows: LeadDetail[]; loading: boolean };
    const board = fixture.componentInstance as unknown as {
      columns: WritableSignal<Col[]>;
      move: (l: LeadDetail, to: string) => void;
    };
    // Seed the CONTACTED column directly (each column has its own request).
    board.columns.update((cols) =>
      cols.map((c) => (c.status === 'CONTACTED' ? { ...c, rows: [lead], loading: false } : { ...c, loading: false })),
    );
    fixture.detectChanges();
    expect(columnNames(fixture, 'CONTACTED')).toEqual(['Lead 9']);

    board.move(lead, 'WON');
    fixture.detectChanges();
    expect(dialog.open).toHaveBeenCalledWith(StatusDialog, expect.objectContaining({ data: { lead, to: 'WON' } }));
    expect(columnNames(fixture, 'CONTACTED')).toEqual(['Lead 9']);
    expect(columnNames(fixture, 'WON')).toEqual([]);
  });

  it('rejects a move the API does not allow, without a request', () => {
    const { api, dialog, fixture } = setup(undefined);
    const lead = makeLead(3, { status: 'NEW', allowed_transitions: ['CONTACTED', 'LOST'] });
    const board = fixture.componentInstance as unknown as { move: (l: LeadDetail, to: string) => void };
    board.move(lead, 'WON');
    fixture.detectChanges();
    expect(dialog.open).not.toHaveBeenCalled();
    expect(api.statusCalls).toEqual([]);
    expect(text(fixture.nativeElement.querySelector('[aria-live]'))).toContain("can't move from New to Won");
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
