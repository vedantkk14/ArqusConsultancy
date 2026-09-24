import { Role } from '../../../core/models';
import { ROLE_HINTS, generatePassword, suggestUsername } from './account-utils';

describe('suggestUsername', () => {
  it('uses the lower-cased part of the email before the @', () => {
    expect(suggestUsername('Riya.Kapoor@crm.com')).toBe('riya.kapoor');
    expect(suggestUsername('a b+c@x.com')).toBe('ab+c');
    expect(suggestUsername('')).toBe('');
    expect(suggestUsername('no-at-sign')).toBe('no-at-sign');
  });
});

describe('generatePassword', () => {
  it('is 14 characters with lower, upper, digit and symbol, and no look-alikes', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(14);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[#@$%&*!?]/);
      expect(p).not.toMatch(/[lIO01]/);
    }
  });

  it('differs between calls and honours an injected random source', () => {
    expect(generatePassword()).not.toBe(generatePassword());
    expect(generatePassword(() => 0)).toBe(generatePassword(() => 0));
  });
});

describe('role hints', () => {
  it('describe every role', () => {
    for (const role of Object.values(Role)) {
      expect(ROLE_HINTS[role].length).toBeGreaterThan(10);
    }
  });
});
