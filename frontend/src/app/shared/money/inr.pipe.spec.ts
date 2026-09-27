import { formatInr, formatInrCompact, groupIndian } from './inr.pipe';

describe('INR formatting', () => {
  it('groups digits the Indian way', () => {
    expect(groupIndian('1')).toBe('1');
    expect(groupIndian('999')).toBe('999');
    expect(groupIndian('1000')).toBe('1,000');
    expect(groupIndian('100000')).toBe('1,00,000');
    expect(groupIndian('12345678')).toBe('1,23,45,678');
  });

  it('formats whole rupees and paise from decimal strings', () => {
    expect(formatInr('1234567.89')).toBe('₹12,34,568');
    expect(formatInr('1234567.89', 'paise')).toBe('₹12,34,567.89');
    expect(formatInr('0.00')).toBe('₹0');
    expect(formatInr('-2500.50')).toBe('-₹2,501');
    expect(formatInr('0.004', 'paise')).toBe('₹0.00');
  });

  it('never goes through floating point for big amounts', () => {
    expect(formatInr('9999999999999.99', 'paise')).toBe('₹99,99,99,99,99,999.99');
  });

  it('formats compact Indian units', () => {
    expect(formatInrCompact('0')).toBe('₹0');
    expect(formatInrCompact('850')).toBe('₹850');
    expect(formatInrCompact('4500')).toBe('₹4.5K');
    expect(formatInrCompact('1230000')).toBe('₹12.3L');
    expect(formatInrCompact('100000')).toBe('₹1L');
    expect(formatInrCompact('12000000')).toBe('₹1.2Cr');
    expect(formatInrCompact('-4500')).toBe('-₹4.5K');
  });

  it('shows a dash for missing or invalid values', () => {
    expect(formatInr(null)).toBe('—');
    expect(formatInrCompact('abc')).toBe('—');
  });
});
