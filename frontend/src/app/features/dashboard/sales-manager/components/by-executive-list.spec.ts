import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ByExecutiveList } from './by-executive-list';
import { ExecRow } from '../sales-manager-dashboard.models';

const ROW = (over: Partial<ExecRow>): ExecRow => ({
  id: 1,
  name: 'Someone',
  open_leads: 0,
  overdue: 0,
  won_count: 0,
  won_value: '0.00',
  conversion_pct: '0.0',
  load_score: 0,
  ...over,
});

function render(rows: ExecRow[]): ComponentFixture<ByExecutiveList> {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ByExecutiveList);
  fixture.componentRef.setInput('rows', rows);
  fixture.detectChanges();
  return fixture;
}

describe('ByExecutiveList', () => {
  it('sorts by load score, highest first', () => {
    const rows = [ROW({ id: 1, name: 'Low', load_score: 2 }), ROW({ id: 2, name: 'High', load_score: 9 })];
    const el = render(rows).nativeElement as HTMLElement;
    const names = [...el.querySelectorAll('.nm')].map((n) => n.textContent?.trim());
    expect(names).toEqual(['High', 'Low']);
  });

  it('highlights an exec past the overdue threshold', () => {
    const rows = [ROW({ id: 1, name: 'Busy', overdue: 4 }), ROW({ id: 2, name: 'Fine', overdue: 2 })];
    const el = render(rows).nativeElement as HTMLElement;
    const hot = el.querySelector('.row.hot');
    expect(hot?.textContent).toContain('Busy');
    expect(hot?.textContent).not.toContain('Fine');
  });

  it('shows the empty-team message when there are no execs', () => {
    const el = render([]).nativeElement as HTMLElement;
    expect(el.textContent).toContain('No sales executives yet. Add one from Team management.');
  });
});
