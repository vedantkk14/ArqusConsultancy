import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { LeadsApi } from '../../data/leads-api.service';
import { WhatsAppDialog, WhatsAppDialogData } from './whatsapp-dialog';

function setup(lead: WhatsAppDialogData['lead']) {
  const api = {
    templates: () => of([{ id: 1, name: 'Follow-up', body: 'wa body' }]),
    emailTemplates: () => of([{ id: 7, name: 'Welcome', subject: 'Hello', body: 'mail body' }]),
    whatsappPreview: () => of({ text: 'wa text', url: 'https://wa.me/1' }),
    emailPreview: () => of({ subject: 'Hello Asha', text: 'mail text' }),
    whatsapp: vi.fn(() => of({ text: 'wa text', url: 'https://wa.me/1' })),
    email: vi.fn(() => of({ subject: 'Hello Asha', text: 'mail text', queued: true })),
  };
  const ref = { close: vi.fn() };
  const snack = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: LeadsApi, useValue: api },
      { provide: MatDialogRef, useValue: ref },
      { provide: MatSnackBar, useValue: snack },
      { provide: MAT_DIALOG_DATA, useValue: { lead } },
    ],
  });
  const fixture = TestBed.createComponent(WhatsAppDialog);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
  return { fixture, el, api, ref, snack, button };
}

describe('WhatsAppDialog (Message <client>)', () => {
  it('is titled "Message <client>" and starts on WhatsApp when the phone works', () => {
    const { el, button } = setup({ id: 3, name: 'Asha Rao', phone: '9876543210', email: 'asha@x.com' });
    expect(el.querySelector('h2, [role="heading"], .title')?.textContent).toContain('Message Asha Rao');
    expect(button('WhatsApp').getAttribute('aria-pressed')).toBe('true');
    expect(button('Open WhatsApp')).toBeTruthy();
  });

  it('switches to Email, shows the subject, and sends the email', () => {
    const { fixture, el, api, ref, snack, button } = setup({
      id: 3,
      name: 'Asha Rao',
      phone: '9876543210',
      email: 'asha@x.com',
    });
    button('Email').click();
    fixture.detectChanges();
    expect(el.querySelector('.subject')?.textContent).toContain('Hello Asha');
    button('Send Email').click();
    expect(api.email).toHaveBeenCalledWith(3, 7, undefined);
    expect(ref.close).toHaveBeenCalledWith(true);
    expect(snack.open).toHaveBeenCalledWith('Email sent to Asha Rao.', undefined, expect.anything());
  });

  it('sends the edited wording when the sender changes the email body', () => {
    const { fixture, el, api, button } = setup({ id: 3, name: 'Asha Rao', phone: '9876543210', email: 'a@x.com' });
    button('Email').click();
    fixture.detectChanges();
    const box = el.querySelector('textarea') as HTMLTextAreaElement;
    box.value = 'My own words';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Send Email').click();
    expect(api.email).toHaveBeenCalledWith(3, 7, 'My own words');
  });

  it('keeps the Email tab clickable, explains a missing address, and never enables Send', () => {
    const noMail = setup({ id: 1, name: 'A', phone: '9876543210', email: '' });
    expect(noMail.button('Email').disabled).toBe(false);
    expect(noMail.button('Email').title).toBe('This lead has no email address yet');
    noMail.button('Email').click();
    noMail.fixture.detectChanges();
    expect(noMail.el.textContent).toContain('This lead has no email address. Add one on the lead first.');
    expect(noMail.button('Send Email').disabled).toBe(true);
    TestBed.resetTestingModule();
    const noPhone = setup({ id: 2, name: 'B', phone: '', email: 'b@x.com' });
    expect(noPhone.button('WhatsApp').disabled).toBe(true);
    expect(noPhone.button('Email').getAttribute('aria-pressed')).toBe('true');
  });
});
