import { isPositiveMoney, parseMoneyInput } from './money-input';

describe('money input', () => {
  it('groups Indian digits while typing and keeps a plain string value', () => {
    expect(parseMoneyInput('1234567')).toEqual({ value: '1234567', display: '12,34,567' });
    expect(parseMoneyInput('12,34,567.5')).toEqual({ value: '1234567.5', display: '12,34,567.5' });
    expect(parseMoneyInput('₹ 250000.759')).toEqual({ value: '250000.75', display: '2,50,000.75' });
    expect(parseMoneyInput('007')).toEqual({ value: '7', display: '7' });
    expect(parseMoneyInput('')).toEqual({ value: '', display: '' });
    expect(parseMoneyInput('.5')).toEqual({ value: '0.5', display: '0.5' });
  });

  it('caps at 12 digits (10 before the point, 2 after)', () => {
    expect(parseMoneyInput('123456789012345').value).toBe('1234567890');
    expect(parseMoneyInput('1234567890.123').value).toBe('1234567890.12');
  });

  it('ignores letters and signs', () => {
    expect(parseMoneyInput('-5a0').value).toBe('50');
  });

  it('knows positive amounts', () => {
    expect(isPositiveMoney('0')).toBe(false);
    expect(isPositiveMoney('0.00')).toBe(false);
    expect(isPositiveMoney('')).toBe(false);
    expect(isPositiveMoney('0.01')).toBe(true);
    expect(isPositiveMoney('250000')).toBe(true);
  });
});
