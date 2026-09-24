import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { fakeViewport } from '../testing/fake-viewport';
import { Expense, ProjectDetail } from '../data/project.models';
import { ProjectsApi, UploadEvent } from '../data/projects-api.service';
import { FakeProjectsApi, makeDetail, makeExpense, makePmDetail } from '../testing/fake-projects-api';
import { ProjectDetailPage } from './project-detail-page';

async function setup(opts: { role?: Role; project?: ProjectDetail | null; width?: number; expenses?: Expense[] } = {}) {
  const role = opts.role ?? Role.Admin;
  const project = opts.project === undefined ? (role === Role.Admin ? makeDetail(1) : makePmDetail(1)) : opts.project;
  const api = new FakeProjectsApi();
  if (opts.expenses) {
    api.expenseRows = opts.expenses;
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'projects/:id', component: ProjectDetailPage, resolve: { project: () => project } }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ProjectsApi, useValue: api },
      fakeViewport(opts.width ?? 1440),
    ],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Alice', email: 'a@x.com', role } });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/projects/1', ProjectDetailPage);
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

describe('ProjectDetailPage', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  describe('role-based UI', () => {
    it('admin sees the finance panel, margins and every action', async () => {
      const { el } = await setup();
      expect(text(el)).toContain('Finance');
      expect(text(el)).toContain('Deal total');
      expect(text(el)).toContain('Live margin');
      for (const label of ['Add expense to', 'Complete', 'Adjust the budget of', 'Reassign']) {
        expect(byLabel(el, label), label).toBeTruthy();
      }
    });

    it('admin sees "Awaiting accounts data" when finance is null', async () => {
      const { el } = await setup({ project: makeDetail(1, { finance: null }) });
      expect(text(el)).toContain('Awaiting accounts data');
    });

    it('a negative margin keeps its minus sign and the negative tone', async () => {
      const finance = { ...makeDetail(1).finance!, live_margin: '-25000.00' };
      const { el } = await setup({ project: makeDetail(1, { finance }) });
      const dd = [...el.querySelectorAll('dd')].find((d) => text(d).includes('25,000') && text(d).startsWith('-'));
      expect(dd).toBeTruthy();
      expect(dd!.classList.contains('neg')).toBe(true);
    });

    it('a project manager has no finance panel in the DOM and no admin actions', async () => {
      const { el } = await setup({ role: Role.ProjectManager });
      expect(el.querySelector('[aria-labelledby="fin-title"]')).toBeNull();
      expect(byLabel(el, 'Add expense to')).toBeTruthy();
      expect(byLabel(el, 'Complete')).toBeTruthy();
      for (const label of ['Adjust the budget of', 'Reassign', 'Assign a manager', 'Reopen']) {
        expect(byLabel(el, label), label).toBeNull();
      }
    });

    it('PM fixture render never contains total, received, outstanding, margin or proposed', async () => {
      const { el } = await setup({ role: Role.ProjectManager });
      expect(text(el).toLowerCase()).not.toMatch(/total|received|outstanding|margin|proposed/);
    });

    it('a completed project offers Reopen to admins and no expense controls', async () => {
      const done = makeDetail(1, { status: 'COMPLETED', allowed_actions: ['reopen'], completed_at: '2026-09-20T06:30:00Z' });
      const { el } = await setup({ project: done, expenses: [makeExpense(1, { can_edit: false })] });
      expect(byLabel(el, 'Reopen')).toBeTruthy();
      expect(byLabel(el, 'Add expense to')).toBeNull();
      expect(byLabel(el, 'Complete')).toBeNull();
    });

    it('shows a friendly not-found state', async () => {
      const { el } = await setup({ project: null });
      expect(text(el)).toContain('Project not found');
    });

    it('phones get the sticky action bar with the project name in each button', async () => {
      const { el } = await setup({ width: 390 });
      const bar = el.querySelector('nav.mbar')!;
      expect(bar).toBeTruthy();
      expect(byLabel(bar, 'Add expense to Project 1')).toBeTruthy();
      expect(byLabel(bar, 'More actions for Project 1')).toBeTruthy();
    });
  });

  describe('budget panel', () => {
    it('says what is left in plain words and shows the three figures', async () => {
      const { el } = await setup();
      const panel = el.querySelector('[aria-labelledby="budget-title"]')!;
      expect(text(panel)).toContain('₹4,80,000 left · 20% used');
      expect(text(panel)).toContain('Sanctioned');
      expect(text(panel)).toContain('₹6,00,000');
    });

    it('an overspent project says how far over it is', async () => {
      const over = makeDetail(1, { spent: '650000.00', remaining: '-50000.00', usage_pct: '108.33', state: 'over' });
      const { el } = await setup({ project: over });
      const panel = el.querySelector('[aria-labelledby="budget-title"]')!;
      expect(text(panel)).toContain('₹50,000 over · 108% used');
      expect(text(panel)).toContain('Over budget');
    });
  });

  describe('add expense', () => {
    async function openForm(opts = {}) {
      const s = await setup(opts);
      byLabel(s.el, 'Add expense to')!.click();
      await settle(s.harness);
      return s;
    }

    it('shows the remaining budget and validates before sending', async () => {
      const { api, harness } = await openForm();
      expect(text(overlay())).toContain('Remaining ₹4,80,000');
      (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click();
      await settle(harness);
      expect(text(overlay())).toContain('Enter the amount.');
      expect(text(overlay())).toContain('Attach a receipt for this expense.');
      expect(document.activeElement?.id).toBe('ae-amount');
      expect(api.actions.length).toBe(0);
    });

    it('rejects a wrong file type and an oversize file with clear messages', async () => {
      const { harness } = await openForm();
      const chooser = overlay().querySelectorAll<HTMLInputElement>('input[type=file]')[1];
      const pick = async (file: File) => {
        Object.defineProperty(chooser, 'files', { value: [file], configurable: true });
        chooser.dispatchEvent(new Event('change'));
        await settle(harness);
      };
      await pick(new File(['x'], 'notes.txt', { type: 'text/plain' }));
      expect(text(overlay())).toContain('Upload a JPG, PNG, WebP or PDF receipt.');
      await pick(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }));
      expect(text(overlay())).toContain('The receipt is larger than 5 MB.');
    });

    it('labour needs no receipt', async () => {
      const { api, harness } = await openForm();
      const amount = field<HTMLInputElement>('ae-amount');
      amount.value = '2500';
      amount.dispatchEvent(new Event('input'));
      field<HTMLInputElement>('ae-cat-LABOUR').click();
      await settle(harness);
      expect(text(overlay())).toContain('Receipt (optional for labour)');
      (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click();
      await settle(harness);
      expect(api.actions[0].name).toBe('addExpense');
      expect(api.actions[0].args[1]).toMatchObject({ amount: '2500', category: 'LABOUR' });
    });

    it('over_budget shows the inline message; the admin can override with a reason', async () => {
      const { api, harness } = await openForm();
      api.uploadResult = throwError(() => ({ status: 409, code: 'over_budget', message: 'x', details: { remaining: '1000.00' } }));
      field<HTMLInputElement>('ae-cat-LABOUR').click();
      const amount = field<HTMLInputElement>('ae-amount');
      amount.value = '5000';
      amount.dispatchEvent(new Event('input'));
      await settle(harness);
      (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click();
      await settle(harness);
      expect(text(overlay())).toContain('This exceeds the remaining budget of ₹1,000.');
      const toggle = overlay().querySelector<HTMLInputElement>('input[role=switch]')!;
      expect(toggle).toBeTruthy();
      toggle.click();
      await settle(harness);
      (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click(); // no reason yet
      await settle(harness);
      expect(text(overlay())).toContain('Give a reason for going over budget.');
      expect(document.activeElement?.id).toBe('ae-override-reason');
      api.uploadResult = of({ kind: 'done', expense: makeExpense(9) });
      const reason = field<HTMLTextAreaElement>('ae-override-reason');
      reason.value = 'Client approved';
      reason.dispatchEvent(new Event('input'));
      (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click();
      await settle(harness);
      expect(api.actions.at(-1)!.args[1]).toMatchObject({ admin_override: true, override_reason: 'Client approved' });
    });

    it('a project manager sees the over-budget message but no override switch', async () => {
      const { api, harness } = await openForm({ role: Role.ProjectManager });
      api.uploadResult = throwError(() => ({ status: 409, code: 'over_budget', message: 'x', details: { remaining: '0.00' } }));
      field<HTMLInputElement>('ae-cat-LABOUR').click();
      const amount = field<HTMLInputElement>('ae-amount');
      amount.value = '5';
      amount.dispatchEvent(new Event('input'));
      await settle(harness);
      (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click();
      await settle(harness);
      expect(text(overlay())).toContain('This exceeds the remaining budget');
      expect(overlay().querySelector('input[role=switch]')).toBeNull();
    });

    it('maps server field errors onto the fields and focuses the first invalid one', async () => {
      const { api, harness } = await openForm();
      api.uploadResult = throwError(() => ({ status: 400, code: 'validation_error', message: 'x', details: { spent_on: ['The date cannot be in the future.'] } }));
      field<HTMLInputElement>('ae-cat-LABOUR').click();
      const amount = field<HTMLInputElement>('ae-amount');
      amount.value = '10';
      amount.dispatchEvent(new Event('input'));
      await settle(harness);
      (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click();
      await settle(harness);
      expect(text(overlay())).toContain('The date cannot be in the future.');
      expect(document.activeElement?.id).toBe('ae-date');
    });

    it('ignores a second submit while uploading and closes with a snackbar when done', async () => {
      const { api, harness } = await openForm();
      const upload = new Subject<UploadEvent>();
      api.uploadResult = upload;
      field<HTMLInputElement>('ae-cat-LABOUR').click();
      const amount = field<HTMLInputElement>('ae-amount');
      amount.value = '10';
      amount.dispatchEvent(new Event('input'));
      await settle(harness);
      const submit = overlay().querySelector('button[type=submit]') as HTMLButtonElement;
      submit.click();
      submit.click();
      await settle(harness);
      expect(api.actions.filter((a) => a.name === 'addExpense').length).toBe(1);
      expect(submit.disabled).toBe(true);
      upload.next({ kind: 'progress', percent: 40 });
      await settle(harness);
      expect(text(submit)).toContain('Uploading… 40%');
      upload.next({ kind: 'done', expense: makeExpense(9) });
      upload.complete();
      await settle(harness);
      await new Promise((r) => setTimeout(r, 400));
      await settle(harness);
      expect(overlay().querySelector('app-add-expense-form')).toBeNull();
      expect(text(overlay())).toContain('Expense added.');
    });

    it('phones open the form in a bottom sheet', async () => {
      await openForm({ width: 390 });
      expect(overlay().querySelector('mat-bottom-sheet-container')).toBeTruthy();
      expect(overlay().querySelector('input[capture=environment]')).toBeTruthy();
    });
  });

  describe('dialogs', () => {
    it('Complete shows what was spent and warns that expenses lock', async () => {
      const { api, el, harness } = await setup();
      byLabel(el, 'Complete')!.click();
      await settle(harness);
      expect(text(overlay())).toContain('Spent ₹1,20,000 of ₹6,00,000');
      expect(text(overlay())).toContain("You can't add expenses after completing.");
      buttonByText(overlay(), 'Complete project')!.click();
      await settle(harness);
      await new Promise((r) => setTimeout(r, 300));
      await settle(harness);
      expect(api.actions[0].name).toBe('complete');
      expect(byLabel(el, 'Reopen')).toBeTruthy();
    });

    it('Reopen needs a reason', async () => {
      const done = makeDetail(1, { status: 'COMPLETED', allowed_actions: ['reopen'] });
      const { api, el, harness } = await setup({ project: done });
      byLabel(el, 'Reopen')!.click();
      await settle(harness);
      buttonByText(overlay(), 'Reopen project')!.click();
      await settle(harness);
      expect(text(overlay())).toContain('Give a reason.');
      expect(api.actions.length).toBe(0);
      const reason = field<HTMLTextAreaElement>('rd-reason');
      reason.value = 'Client wants extra work';
      reason.dispatchEvent(new Event('input'));
      buttonByText(overlay(), 'Reopen project')!.click();
      await settle(harness);
      expect(api.actions[0]).toMatchObject({ name: 'reopen', args: [1, 'Client wants extra work'] });
    });

    it('Adjust budget needs a reason, shows spent and the maximum, and shows the server error inline', async () => {
      const { api, el, harness } = await setup();
      byLabel(el, 'Adjust the budget of')!.click();
      await settle(harness);
      expect(text(overlay())).toContain('Already spent ₹1,20,000.');
      expect(text(overlay())).toContain('Cannot exceed ₹10,00,000.');
      buttonByText(overlay(), 'Save budget')!.click();
      await settle(harness);
      expect(text(overlay())).toContain('Give a reason for the change.');
      api.changeBudget = () => throwError(() => ({ status: 400, code: 'budget_below_spent', message: 'The budget cannot be lower than the ₹1,20,000.00 already spent.', details: {} }));
      const reason = field<HTMLTextAreaElement>('bd-reason');
      reason.value = 'Scope reduced';
      reason.dispatchEvent(new Event('input'));
      buttonByText(overlay(), 'Save budget')!.click();
      await settle(harness);
      expect(text(overlay())).toContain('cannot be lower than');
    });

    it('Reassign lists the managers with their running counts', async () => {
      const { api, el, harness } = await setup();
      byLabel(el, 'Reassign')!.click();
      await settle(harness);
      expect(text(field('ra-pm'))).toContain('Anita Kulkarni · 4 running');
      const select = field<HTMLSelectElement>('ra-pm');
      select.value = select.querySelector<HTMLOptionElement>('option[value="8"]')!.value;
      select.dispatchEvent(new Event('change'));
      await settle(harness);
      buttonByText(overlay(), 'Save')!.click();
      await settle(harness);
      expect(api.actions[0]).toMatchObject({ name: 'assignPm', args: [1, 8] });
    });
  });

  describe('expense rows', () => {
    it('opens the receipt viewer and gives focus back to the button when it closes', async () => {
      const { el, harness } = await setup();
      const trigger = byLabel(el, 'View receipt')!;
      trigger.focus();
      trigger.click();
      await settle(harness);
      expect(overlay().querySelector('app-receipt-viewer')).toBeTruthy();
      expect(overlay().querySelector('img[alt="Receipt image"]')).toBeTruthy();
      buttonByText(overlay(), 'Close')!.click();
      await settle(harness);
      await new Promise((r) => setTimeout(r, 300));
      expect(overlay().querySelector('app-receipt-viewer')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it('shows Void and Override tags and hides the menu when the server says the row is locked', async () => {
      const { el } = await setup({
        expenses: [
          makeExpense(1, { is_void: true, void_reason: 'Duplicate', can_edit: false }),
          makeExpense(2, { is_override: true, can_edit: false }),
        ],
      });
      expect(text(el.querySelector('.tag.void'))).toBe('Void');
      expect(text(el.querySelector('.tag.over'))).toBe('Override');
      expect(byLabel(el, 'More actions: ')).toBeNull();
    });

    it('voids with a reason through the reason dialog', async () => {
      const { api, el, harness } = await setup();
      byLabel(el, 'More actions: ')!.click();
      await settle(harness);
      buttonByText(document.body, 'Void…')!.click();
      await settle(harness);
      buttonByText(overlay(), 'Void expense')!.click();
      await settle(harness);
      expect(text(overlay())).toContain('Give a reason.');
      const reason = field<HTMLTextAreaElement>('rd-reason');
      reason.value = 'Entered twice';
      reason.dispatchEvent(new Event('input'));
      buttonByText(overlay(), 'Void expense')!.click();
      await settle(harness);
      expect(api.actions[0]).toMatchObject({ name: 'voidExpense', args: [1, 'Entered twice'] });
    });
  });
});
