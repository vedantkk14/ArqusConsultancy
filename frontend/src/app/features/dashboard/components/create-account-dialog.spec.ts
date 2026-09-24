import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { CreateAccountDialog } from './create-account-dialog';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function setup() {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MatDialogRef, useValue: { close } }],
  });
  const fixture = TestBed.createComponent(CreateAccountDialog);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  const type = (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
  };
  const pick = (id: string, value: string) => {
    const select = el.querySelector<HTMLSelectElement>(`#${id}`)!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const submit = () => {
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    fixture.detectChanges();
  };
  const fillAll = (role = 'PROJECT_MANAGER') => {
    type('ca-first_name', 'Paul');
    type('ca-last_name', 'Project');
    type('ca-email', 'Paul.Project@crm.local');
    pick('ca-role', role);
    type('ca-password', 'Welcome#2026x');
    fixture.detectChanges();
  };
  return { fixture, el, http, close, type, pick, submit, fillAll };
}

describe('CreateAccountDialog', () => {
  it('lists every role in the dropdown and explains the chosen one', () => {
    const { el, pick } = setup();
    const options = [...el.querySelectorAll('#ca-role option')].map(text);
    expect(options).toEqual(['Select a role', 'Admin', 'Sales Manager', 'Sales Executive', 'Project Manager']);
    expect(text(el.querySelector('.hint'))).toContain('Choose what this person can do.');
    pick('ca-role', 'PROJECT_MANAGER');
    expect(text(el.querySelector('.hint'))).toContain('Never sees leads, payments or project totals');
  });

  it('suggests the username from the email until it is edited', () => {
    const { fixture, el, type } = setup();
    type('ca-email', 'Riya.K@crm.local');
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#ca-username')!.value).toBe('riya.k');
    type('ca-username', 'riya');
    type('ca-email', 'other@crm.local');
    expect(el.querySelector<HTMLInputElement>('#ca-username')!.value).toBe('riya');
  });

  it('shows what is missing and sends nothing until the form is valid', () => {
    const { el, http, submit } = setup();
    submit();
    http.expectNone('/api/v1/users');
    expect(text(el)).toContain('Choose a role.');
    expect([...el.querySelectorAll('.err')].length).toBeGreaterThanOrEqual(5);
  });

  it('generates a password and shows it', () => {
    const { fixture, el } = setup();
    el.querySelector<HTMLButtonElement>('.pwrow button[matButton], .pwrow > button')!.click();
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('#ca-password')!;
    expect(input.value).toHaveLength(14);
    expect(input.type).toBe('text');
  });

  it('creates the account and then shows the sign-in details', () => {
    const { fixture, el, http, submit, fillAll } = setup();
    fillAll('SALES_EXEC');
    submit();
    const req = http.expectOne('/api/v1/users');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      first_name: 'Paul',
      last_name: 'Project',
      email: 'Paul.Project@crm.local',
      username: 'paul.project',
      role: 'SALES_EXEC',
      password: 'Welcome#2026x',
      must_change_password: true,
    });
    req.flush({ id: 9, name: 'Paul Project', email: 'Paul.Project@crm.local', role: 'SALES_EXEC', must_change_password: true });
    fixture.detectChanges();
    expect(text(el.querySelector('h2'))).toBe('Account created');
    expect(text(el.querySelector('.details'))).toContain('paul.project');
    expect(text(el.querySelector('.details'))).toContain('Welcome#2026x');
    expect(text(el.querySelector('.ok'))).toContain('Sales Executive');
  });

  it('maps server errors onto the fields', () => {
    const { fixture, el, http, submit, fillAll } = setup();
    fillAll();
    submit();
    http.expectOne('/api/v1/users').flush(
      { error: { code: 'validation_error', message: 'Validation failed.', details: { username: ['This username is already taken.'], password: ['This password is too common.'] } } },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(text(el)).toContain('This username is already taken.');
    expect(text(el)).toContain('This password is too common.');
    expect(el.querySelector('h2')!.textContent).toContain('Create account');
  });
});
