import { TestBed } from '@angular/core/testing';
import { FollowupPicker, joinLocal, splitLocal } from './followup-picker';

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('followup helpers', () => {
  it('splits and joins the local value', () => {
    expect(splitLocal('2026-09-24T14:00')).toEqual({ date: '2026-09-24', time: '14:00' });
    expect(splitLocal('')).toEqual({ date: '', time: '' });
    expect(joinLocal('2026-09-24', '14:00')).toBe('2026-09-24T14:00');
    expect(joinLocal('2026-09-24', '')).toBe('2026-09-24T10:00'); // default time
    expect(joinLocal('', '14:00')).toBe('');
  });
});

describe('FollowupPicker', () => {
  function setup() {
    const fixture = TestBed.createComponent(FollowupPicker);
    fixture.detectChanges();
    const changes: string[] = [];
    fixture.componentInstance.registerOnChange((v: string) => changes.push(v));
    const el = fixture.nativeElement as HTMLElement;
    const click = (sel: string, label: string) => {
      [...el.querySelectorAll<HTMLButtonElement>(sel)].find((b) => text(b) === label)!.click();
      fixture.detectChanges();
    };
    return { fixture, el, changes, click };
  }

  it('time buttons are off until a date is chosen, then fix the hour', () => {
    const { el, changes, click } = setup();
    expect(el.querySelector<HTMLButtonElement>('.times .chip')!.disabled).toBe(true);
    expect(text(el.querySelector('.pv'))).toBe('No follow-up set');

    click('.quick .chip', 'Tomorrow');
    expect(changes.at(-1)).toMatch(/^\d{4}-\d{2}-\d{2}T10:00$/);
    expect(el.querySelector<HTMLButtonElement>('.times .chip')!.disabled).toBe(false);

    click('.times .chip', '2 pm');
    expect(changes.at(-1)).toMatch(/T14:00$/);
    expect(el.querySelector('.times .chip[aria-pressed="true"]')!.textContent!.trim()).toBe('2 pm');
    expect(text(el.querySelector('.pv'))).toContain('2:00 pm');
  });

  it('a typed date takes the default time, and Clear empties the value', () => {
    const { fixture, el, changes, click } = setup();
    const date = el.querySelector<HTMLInputElement>('input[type=date]')!;
    date.value = '2099-01-15';
    date.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(changes.at(-1)).toBe('2099-01-15T10:00');

    click('.foot .clear', 'Clear');
    expect(changes.at(-1)).toBe('');
    expect(el.querySelector<HTMLInputElement>('input[type=time]')!.disabled).toBe(true);
  });

  it('writeValue shows an existing follow-up', () => {
    const { fixture, el } = setup();
    fixture.componentInstance.writeValue('2099-01-15T16:00');
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('input[type=date]')!.value).toBe('2099-01-15');
    expect(el.querySelector('.times .chip[aria-pressed="true"]')!.textContent!.trim()).toBe('4 pm');
  });
});
