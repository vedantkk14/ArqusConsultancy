import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProjectsApi } from '../../projects/data/projects-api.service';
import { AddClientProjectDialog } from '../components/add-client-project-dialog';
import { ClientRow } from '../data/client.models';
import { ClientsApi } from '../data/clients-api.service';
import { ClientsPage } from './clients-page';

const CLIENT: ClientRow = {
  id: 7,
  name: 'Badagu Sports',
  phone: '+919812345678',
  email: 'badagu@example.com',
  total_projects: 2,
  running_projects: 1,
  completed_projects: 1,
  projects: [
    { id: 1, no: 1, name: 'Turf phase 1', status: 'COMPLETED', pm_name: 'Paul Project', start_date: null },
    { id: 2, no: 2, name: 'Turf phase 2', status: 'RUNNING', pm_name: null, start_date: null },
  ],
};

function setupPage(rows: ClientRow[] = [CLIENT], dialogResult: unknown = undefined) {
  const api = { list: vi.fn(() => of({ count: rows.length, next: null, previous: null, results: rows })) };
  const dialog = { open: vi.fn(() => ({ afterClosed: () => of(dialogResult) })) };
  const snack = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ClientsApi, useValue: api },
      { provide: MatDialog, useValue: dialog },
      { provide: MatSnackBar, useValue: snack },
    ],
  });
  const fixture = TestBed.createComponent(ClientsPage);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, api, dialog, snack };
}

describe('ClientsPage (My Clients)', () => {
  it('lists each client with their numbered projects, status and manager', () => {
    const { el } = setupPage();
    const text = el.textContent ?? '';
    expect(text).toContain('Badagu Sports');
    expect(text).toContain('1 running');
    expect(text).toContain('1 completed');
    expect(text).toContain('#1');
    expect(text).toContain('Turf phase 2');
    expect(text).toContain('PM: Paul Project');
    expect(text).toContain('No project manager yet');
  });

  it('shows an empty state when there are no clients', () => {
    const { el } = setupPage([]);
    expect(el.textContent).toContain('No clients yet');
  });

  it('opens the add-project dialog for that client and updates the row afterwards', () => {
    const updated: ClientRow = {
      ...CLIENT,
      total_projects: 3,
      running_projects: 2,
      projects: [
        ...CLIENT.projects,
        { id: 3, no: 3, name: 'Turf phase 3', status: 'RUNNING', pm_name: 'Paul Project', start_date: null },
      ],
    };
    const { fixture, el, dialog, snack } = setupPage([CLIENT], { project: 3, client: updated });
    const add = el.querySelector('button[aria-label="Add a new project for Badagu Sports"]') as HTMLButtonElement;
    add.click();
    fixture.detectChanges();
    expect(dialog.open).toHaveBeenCalledWith(AddClientProjectDialog, {
      data: { client: { id: 7, name: 'Badagu Sports' } },
    });
    expect(el.textContent).toContain('Turf phase 3');
    expect(el.textContent).toContain('2 running');
    expect(snack.open).toHaveBeenCalledWith('New project added for Badagu Sports.', undefined, expect.anything());
  });
});

function setupDialog(
  addProject = vi.fn<ClientsApi['addProject']>(() => of({ project: 9, client: CLIENT })),
) {
  const ref = { close: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: ClientsApi, useValue: { addProject } },
      {
        provide: ProjectsApi,
        useValue: { managers: () => of([{ id: 4, name: 'Paul Project', running_projects: 2 }]) },
      },
      { provide: MatDialogRef, useValue: ref },
      { provide: MAT_DIALOG_DATA, useValue: { client: { id: 7, name: 'Badagu Sports' } } },
    ],
  });
  const fixture = TestBed.createComponent(AddClientProjectDialog);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const fill = async (id: string, value: string) => {
    await fixture.whenStable(); // ngModel writes its initial value in a microtask
    const input = el.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const submit = async () => {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, el, ref, addProject, fill, submit };
}

describe('AddClientProjectDialog', () => {
  it('needs a project name and a price before it sends anything', async () => {
    const { el, addProject, submit } = setupDialog();
    await submit();
    expect(el.textContent).toContain('Enter a project name.');
    expect(el.textContent).toContain('Enter the project price.');
    expect(addProject).not.toHaveBeenCalled();
  });

  it('sends name, requirements, price, manager and dates, then closes with the result', async () => {
    const { ref, addProject, fill, submit } = setupDialog();
    await fill('np-name', 'Turf phase 3');
    await fill('np-req', 'Two more courts');
    await fill('np-amount', '2,50,000');
    await fill('np-pm', '4');
    await fill('np-start', '2026-11-01');
    await submit();
    expect(addProject).toHaveBeenCalledWith(7, {
      name: 'Turf phase 3',
      requirements: 'Two more courts',
      amount: '250000.00',
      pm: 4,
      start_date: '2026-11-01',
      expected_end_date: null,
    });
    expect(ref.close).toHaveBeenCalledWith({ project: 9, client: CLIENT });
  });

  it('lets the project manager be assigned later', async () => {
    const { addProject, fill, submit } = setupDialog();
    await fill('np-name', 'Turf phase 3');
    await fill('np-amount', '1000');
    await submit();
    expect(addProject.mock.calls[0][1]).toMatchObject({ pm: null, amount: '1000.00' });
  });

  it('rejects an end date before the start date', async () => {
    const { el, addProject, fill, submit } = setupDialog();
    await fill('np-name', 'X');
    await fill('np-amount', '10');
    await fill('np-start', '2026-12-01');
    await fill('np-end', '2026-11-01');
    await submit();
    expect(el.textContent).toContain('end date cannot be before');
    expect(addProject).not.toHaveBeenCalled();
  });

  it('explains when the client still has an open deal', async () => {
    const open = vi.fn<ClientsApi['addProject']>(() =>
      throwError(() => ({ code: 'opportunity_open', message: 'x', details: {} })),
    );
    const { el, ref, fill, submit } = setupDialog(open);
    await fill('np-name', 'X');
    await fill('np-amount', '10');
    await submit();
    expect(el.textContent).toContain('still has an open deal');
    expect(ref.close).not.toHaveBeenCalled();
  });
});
