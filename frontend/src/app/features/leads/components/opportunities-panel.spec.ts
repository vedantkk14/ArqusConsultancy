import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Opportunity } from '../data/lead.models';
import { LeadsApi } from '../data/leads-api.service';
import { FakeLeadsApi, page } from '../testing/fake-leads-api';
import { OpportunitiesPanel } from './opportunities-panel';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function deal(id: number, patch: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    lead: 1,
    sequence_no: id,
    status: 'NEW',
    assigned_to: { id: 7, name: 'Eva Exec' },
    next_followup_at: null,
    days_overdue: 0,
    proposed_amount: null,
    won_at: null,
    lost_reason: '',
    lost_note: '',
    requirements: '',
    created_by: null,
    created_at: '2026-09-01T06:30:00Z',
    updated_at: '2026-09-01T06:30:00Z',
    allowed_transitions: [],
    is_current: false,
    is_open: false,
    ...patch,
  };
}

function render(deals: Opportunity[], focusId: number | null = null) {
  const api = new FakeLeadsApi() as FakeLeadsApi & { opportunityInteractions: ReturnType<typeof vi.fn> };
  api.opportunityInteractions = vi.fn(() => of(page([])));
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: LeadsApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(OpportunitiesPanel);
  fixture.componentRef.setInput('leadId', 1);
  fixture.componentRef.setInput('deals', deals);
  fixture.componentRef.setInput('focusId', focusId);
  fixture.detectChanges();
  return { api, el: fixture.nativeElement as HTMLElement, fixture };
}

describe('OpportunitiesPanel', () => {
  const deals = [
    deal(2, { is_current: true, is_open: true, proposed_amount: '50000.00' }),
    deal(1, {
      status: 'WON',
      won_at: '2026-08-10T06:30:00Z',
      proposed_amount: '100000.00',
      project_id: 12,
      project_name: 'Turf one',
      ledger_id: 3,
      finance: { finalized: true, total_amount: '95000.00', finalized_at: '2026-08-11T06:30:00Z' },
    }),
  ];

  it('lists every deal with status, dates, amounts and the project link', () => {
    const { el } = render(deals);
    const rows = [...el.querySelectorAll('li.deal')];
    expect(rows.map((r) => text(r.querySelector('.no')))).toEqual(['Deal #2', 'Deal #1']);
    expect(text(rows[0])).toContain('Current');
    expect(text(rows[0])).toContain('₹50,000');
    expect(text(rows[1])).toContain('Won');
    expect(text(rows[1])).toContain('Final ₹95,000');
    expect(rows[1].querySelector('a.proj')!.getAttribute('href')).toBe('/projects/12');
  });

  it('older deals expand to their own timeline; the current one does not', () => {
    const { api, el, fixture } = render(deals);
    const rows = el.querySelectorAll('li.deal');
    expect(rows[0].querySelector('button.more')).toBeNull();
    rows[1].querySelector<HTMLButtonElement>('button.more')!.click();
    fixture.detectChanges();
    expect(api.opportunityInteractions).toHaveBeenCalledWith(1, 1, 1);
    expect(rows[1].querySelector('app-lead-timeline')).toBeTruthy();
  });

  it('a focused older deal opens by itself', () => {
    const { el } = render(deals, 1);
    expect(el.querySelector('#deal-1.focus app-lead-timeline')).toBeTruthy();
  });

  it('shows no finance or project keys when the API sends none (Sales Exec)', () => {
    const { el } = render([deal(1, { status: 'WON', proposed_amount: '10.00' })]);
    expect(text(el)).not.toContain('Final');
    expect(el.querySelector('a.proj')).toBeNull();
  });
});
