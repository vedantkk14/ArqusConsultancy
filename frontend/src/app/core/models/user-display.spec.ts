import { firstName, greeting } from './user-display';

describe('user display helpers', () => {
  it('takes the first word of the name', () => {
    expect(firstName('Alice Admin')).toBe('Alice');
    expect(firstName('  Paul   van Project ')).toBe('Paul');
    expect(firstName('Madonna')).toBe('Madonna');
    expect(firstName('')).toBe('there');
    expect(firstName(null)).toBe('there');
  });

  it('greets by the time of day', () => {
    expect(greeting(new Date(2026, 8, 24, 6))).toBe('Good morning');
    expect(greeting(new Date(2026, 8, 24, 11, 59))).toBe('Good morning');
    expect(greeting(new Date(2026, 8, 24, 12))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 8, 24, 16, 59))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 8, 24, 17))).toBe('Good evening');
    expect(greeting(new Date(2026, 8, 24, 23))).toBe('Good evening');
  });
});
