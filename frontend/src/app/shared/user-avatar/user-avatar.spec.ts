import { initials } from './user-avatar';

describe('initials', () => {
  it('uses first and last name', () => {
    expect(initials('Alice Admin')).toBe('AA');
    expect(initials('  paul   van  project ')).toBe('PP');
  });

  it('handles a single name and empty input', () => {
    expect(initials('Madonna')).toBe('M');
    expect(initials('   ')).toBe('?');
  });
});
