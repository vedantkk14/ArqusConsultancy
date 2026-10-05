import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { LeadsApi } from '../../leads/data/leads-api.service';
import { EditTemplateDialog } from '../components/edit-template-dialog';
import { TemplatesPage } from './templates-page';

function setupPage(role: Role, dialogResult: unknown = undefined) {
  const dialog = { open: vi.fn(() => ({ afterClosed: () => of(dialogResult) })) };
  const snack = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: LeadsApi,
        useValue: {
          templates: () => of([{ id: 1, name: 'Follow-up', body: 'wa' }]),
          emailTemplates: () => of([]),
          callScripts: () => of([]),
          list: () => of({ count: 0, next: null, previous: null, results: [] }),
        },
      },
      { provide: AuthService, useValue: { role: signal(role) } },
      { provide: MatDialog, useValue: dialog },
      { provide: MatSnackBar, useValue: snack },
    ],
  });
  const fixture = TestBed.createComponent(TemplatesPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const add = () => el.querySelector('button.add') as HTMLButtonElement | null;
  return { fixture, el, dialog, snack, add };
}

describe('TemplatesPage add button', () => {
  it('is shown to admins and sales managers, not sales executives', () => {
    expect(setupPage(Role.Admin).add()).toBeTruthy();
    TestBed.resetTestingModule();
    expect(setupPage(Role.SalesManager).add()).toBeTruthy();
    TestBed.resetTestingModule();
    expect(setupPage(Role.SalesExec).add()).toBeNull();
  });

  it('opens the dialog for the current tab and lists the new template', () => {
    const saved = { id: 9, name: 'Offer', body: 'New offer' };
    const { fixture, el, dialog, snack, add } = setupPage(Role.Admin, saved);
    expect(add()!.textContent).toContain('Add WhatsApp template');
    add()!.click();
    fixture.detectChanges();
    expect(dialog.open).toHaveBeenCalledWith(EditTemplateDialog, { data: { kind: 'whatsapp-templates' } });
    expect(el.textContent).toContain('Offer');
    expect(snack.open).toHaveBeenCalledWith('Offer added.', undefined, expect.anything());
  });

  it('labels the button per tab', () => {
    const { fixture, el, add } = setupPage(Role.Admin);
    const tabs = Array.from(el.querySelectorAll('button.tab')) as HTMLButtonElement[];
    tabs[1].click();
    fixture.detectChanges();
    expect(add()!.textContent).toContain('Add email template');
    tabs[2].click();
    fixture.detectChanges();
    expect(add()!.textContent).toContain('Add call script');
  });
});

describe('EditTemplateDialog in create mode', () => {
  it('posts a new template and closes with the saved one', async () => {
    const created = { id: 5, name: 'Intro', subject: 'Hello', body: 'Body' };
    const api = { createTemplate: vi.fn(() => of(created)), updateTemplate: vi.fn() };
    const ref = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: LeadsApi, useValue: api },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { kind: 'email-templates' } },
      ],
    });
    const fixture = TestBed.createComponent(EditTemplateDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('New template');
    const fill = (id: string, value: string) => {
      const input = el.querySelector(`#${id}`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    fill('et-name', 'Intro');
    fill('et-subject', 'Hello');
    fill('et-body', 'Body');
    fixture.detectChanges();
    await fixture.whenStable();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    expect(api.createTemplate).toHaveBeenCalledWith('email-templates', { name: 'Intro', body: 'Body', subject: 'Hello' });
    expect(api.updateTemplate).not.toHaveBeenCalled();
    expect(ref.close).toHaveBeenCalledWith(created);
  });
});
