import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';
import { fakeBreakpoints } from '../../../layout/testing/fake-breakpoints';
import { ProjectsApi } from '../data/projects-api.service';
import { CONVERTIBLE, FakeProjectsApi, makeDetail } from '../testing/fake-projects-api';
import { ConvertPage } from './convert-page';

async function setup(url = '/projects/convert', width = 1440) {
  const api = new FakeProjectsApi();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'projects/convert', component: ConvertPage }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ProjectsApi, useValue: api },
      fakeBreakpoints(width),
    ],
  });
  TestBed.inject(AuthService).login('u', 'pw').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/v1/auth/login')
    .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'Alice Admin', email: 'a@x.com', role: Role.Admin } });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ConvertPage);
  harness.detectChanges();
  await harness.fixture.whenStable();
  harness.detectChanges();
  return { api, harness, el: harness.routeNativeElement as HTMLElement };
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const overlay = () => document.querySelector('.cdk-overlay-container') as HTMLElement;
const field = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function settle(harness: RouterTestingHarness) {
  harness.detectChanges();
  await harness.fixture.whenStable();
  harness.detectChanges();
}

describe('ConvertPage', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('lists eligible won deals and opens the panel with the suggested budget', async () => {
    const { el, harness } = await setup();
    expect(text(el.querySelector('.count'))).toBe('1 won deal waiting');
    (el.querySelector('button[aria-label^="Convert Kolhapur"]') as HTMLButtonElement).click();
    await settle(harness);
    expect(text(overlay())).toContain('Cannot exceed ₹3,00,000');
    expect(field<HTMLInputElement>('cv-budget').value).toBe('1,80,000.00');
    expect(field<HTMLInputElement>('cv-name').value).toBe('Kolhapur Kabaddi League');
    expect(text(field('cv-pm'))).toContain('Assign later');
    expect(text(field('cv-pm'))).toContain('Paul Project · 3 running');
  });

  it('?lead=<id> opens the panel directly', async () => {
    const { overlayText } = await setup('/projects/convert?lead=9').then(async (s) => {
      await settle(s.harness);
      return { overlayText: text(overlay()) };
    });
    expect(overlayText).toContain('Convert to project');
  });

  it('?lead=<id> for a lead that is not ready shows why, with a link', async () => {
    const api = new FakeProjectsApi();
    api.convertible$ = of({ count: 1, results: [{ ...CONVERTIBLE, lead: 5, ineligible_reason: 'project_exists', project_id: 77 }] });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/convert', component: ConvertPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProjectsApi, useValue: api },
        fakeBreakpoints(1440),
      ],
    });
    TestBed.inject(AuthService).login('u', 'pw').subscribe();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/login')
      .flush({ access: 'A', refresh: 'R', user: { id: 1, name: 'A', email: 'a@x.com', role: Role.Admin } });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects/convert?lead=5', ConvertPage);
    await settle(harness);
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el.querySelector('.blocked'))).toContain('Already a project: open it');
    expect(el.querySelector('.blocked a[href="/projects/77"]')).toBeTruthy();
  });

  it('validates the form and focuses the first invalid field', async () => {
    const { el, harness, api } = await setup();
    (el.querySelector('button[aria-label^="Convert Kolhapur"]') as HTMLButtonElement).click();
    await settle(harness);
    const name = field<HTMLInputElement>('cv-name');
    name.value = '';
    name.dispatchEvent(new Event('input'));
    (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click();
    await settle(harness);
    expect(text(overlay())).toContain('Enter a project name.');
    expect(document.activeElement).toBe(name);
    expect(api.converts.length).toBe(0);
  });

  it('shows the API budget error under the amount', async () => {
    const { el, harness, api } = await setup();
    api.convertResult = throwError(() => ({
      status: 400,
      code: 'budget_exceeds_total',
      message: 'The budget cannot exceed the deal total of ₹3,00,000.00.',
      details: {},
    }));
    (el.querySelector('button[aria-label^="Convert Kolhapur"]') as HTMLButtonElement).click();
    await settle(harness);
    (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click();
    await settle(harness);
    expect(text(overlay())).toContain('cannot exceed the deal total');
    expect(document.activeElement?.id).toBe('cv-budget');
  });

  it('a successful conversion removes the row and says "Project created"', async () => {
    const { el, harness, api } = await setup();
    api.convertResult = of(makeDetail(5));
    (el.querySelector('button[aria-label^="Convert Kolhapur"]') as HTMLButtonElement).click();
    await settle(harness);
    (overlay().querySelector('button[type=submit]') as HTMLButtonElement).click();
    await settle(harness);
    expect(api.converts[0]).toMatchObject({ lead: 9, sanctioned_budget: '180000.00', pm: null });
    expect(el.querySelector('button[aria-label^="Convert Kolhapur"]')).toBeNull();
    expect(text(overlay())).toContain('Project created');
    expect(text(el)).toContain('No won deals to convert');
  });

  it('phones get a bottom sheet instead of a side panel', async () => {
    const { el, harness } = await setup('/projects/convert', 390);
    (el.querySelector('button[aria-label^="Convert Kolhapur"]') as HTMLButtonElement).click();
    await settle(harness);
    expect(overlay().querySelector('mat-bottom-sheet-container')).toBeTruthy();
  });
});
