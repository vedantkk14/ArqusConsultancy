import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Topbar } from './topbar';

describe('Topbar', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [
        provideRouter([
          { path: 'leads', title: 'All Leads', children: [] },
          { path: 'projects', title: 'Running', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
  });

  it('shows the title of the current route and follows navigation', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(Topbar);
    const title = () => (fixture.nativeElement as HTMLElement).querySelector('.page-title')?.textContent?.trim();

    await router.navigateByUrl('/leads');
    await fixture.whenStable();
    expect(title()).toBe('All Leads');

    await router.navigateByUrl('/projects');
    await fixture.whenStable();
    expect(title()).toBe('Running');
  });
});
