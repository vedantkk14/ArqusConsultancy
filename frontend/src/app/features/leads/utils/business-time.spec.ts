import {
  atBusinessTime,
  businessDay,
  followupState,
  formatBusiness,
  nextMonday,
  relativeLabel,
  toBusinessInput,
  toBusinessIso,
} from './business-time';

describe('business time (Asia/Kolkata)', () => {
  it('converts an IST wall time to UTC and back', () => {
    expect(toBusinessIso('2026-09-24T01:30')).toBe('2026-09-23T20:00:00.000Z');
    expect(toBusinessInput('2026-09-23T20:00:00.000Z')).toBe('2026-09-24T01:30');
    expect(toBusinessIso('')).toBeNull();
    expect(toBusinessInput(null)).toBe('');
  });

  it('keeps a 1:30 am IST follow-up on its own day (not "yesterday")', () => {
    const now = new Date('2026-09-23T21:00:00Z'); // 2:30 am IST on the 24th
    const at = toBusinessIso('2026-09-24T01:30')!; // 20:00 UTC on the 23rd
    expect(formatBusiness(at, now)).toBe('Today, 1:30 am');
    expect(businessDay(at)).toBe(businessDay(now));
  });

  it('labels today, tomorrow, yesterday and other dates', () => {
    const now = new Date('2026-09-24T06:30:00Z'); // noon IST
    expect(formatBusiness('2026-09-24T11:30:00Z', now)).toBe('Today, 5:00 pm');
    expect(formatBusiness('2026-09-25T04:30:00Z', now)).toBe('Tomorrow, 10:00 am');
    expect(formatBusiness('2026-09-22T18:30:00Z', now)).toBe('Yesterday, 12:00 am');
    expect(formatBusiness('2026-10-12T09:30:00Z', now)).toMatch(/^12 Oct, 3:00 pm$/);
  });

  it('builds quick times at IST wall-clock hours', () => {
    const now = new Date('2026-09-24T20:00:00Z'); // 1:30 am IST on the 25th
    expect(atBusinessTime(0, 17, 0, now)).toBe('2026-09-25T11:30:00.000Z');
    expect(atBusinessTime(1, 10, 0, now)).toBe('2026-09-26T04:30:00.000Z');
    expect(nextMonday(10, new Date('2026-09-24T06:30:00Z'))).toBe('2026-09-28T04:30:00.000Z'); // Thu -> Mon
    expect(nextMonday(10, new Date('2026-09-28T06:30:00Z'))).toBe('2026-10-05T04:30:00.000Z'); // Mon -> next Mon
  });

  it('describes follow-up states', () => {
    const now = new Date('2026-09-24T06:30:00Z');
    expect(followupState(null, now)).toEqual({ kind: 'none', label: 'No follow-up' });
    expect(followupState('2026-09-21T06:30:00Z', now)).toEqual({ kind: 'overdue', label: '3d overdue' });
    expect(followupState('2026-09-24T05:30:00Z', now)).toEqual({ kind: 'overdue', label: 'Overdue' });
    expect(followupState('2026-09-24T11:30:00Z', now).kind).toBe('today');
    expect(followupState('2026-09-25T11:30:00Z', now).kind).toBe('upcoming');
  });

  it('writes relative times', () => {
    const now = new Date('2026-09-24T06:30:00Z');
    expect(relativeLabel('2026-09-24T06:29:40Z', now)).toBe('just now');
    expect(relativeLabel('2026-09-24T06:25:00Z', now)).toBe('5 min ago');
    expect(relativeLabel('2026-09-24T03:30:00Z', now)).toBe('3 h ago');
    expect(relativeLabel('2026-09-23T06:30:00Z', now)).toBe('yesterday');
    expect(relativeLabel('2026-09-20T06:30:00Z', now)).toBe('4 days ago');
  });
});
