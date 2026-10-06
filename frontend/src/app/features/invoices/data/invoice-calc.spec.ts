import { computeTotals, inWords, indian, ordinalDate, quantityText } from './invoice-calc';

describe('invoice calculations (mirror the server)', () => {
  it('reads amounts in words like the sample invoice', () => {
    expect(inWords(3733355)).toBe('Thirty Seven Lakh Thirty Three Thousand Three Hundred And Fifty Five');
    expect(inWords(100000)).toBe('One Lakh');
    expect(inWords(105000)).toBe('One Lakh Five Thousand');
    expect(inWords(21500000)).toBe('Two Crore Fifteen Lakh');
    expect(inWords(105)).toBe('One Hundred And Five');
    expect(inWords(0)).toBe('Zero');
  });

  it('adds IGST and rounds the total to the rupee', () => {
    const t = computeTotals([{ quantity: '8304.09', rate: '381.00' }], '18', 'IGST');
    expect(t.amounts).toEqual(['3163858.29']);
    expect(t.subtotal).toBe('3163858.29');
    expect(t.tax).toBe('569494.49');
    expect(t.roundOff).toBe('0.22');
    expect(t.total).toBe('3733353.00');
    expect(t.words).toBe('Thirty Seven Lakh Thirty Three Thousand Three Hundred And Fifty Three');
  });

  it('treats a blank GST as no tax', () => {
    const t = computeTotals([{ quantity: '2', rate: '10.50' }, { quantity: '3', rate: '4.25' }], '', 'IGST');
    expect(t.subtotal).toBe('33.75');
    expect(t.tax).toBe('0.00');
    expect(t.total).toBe('34.00');
    expect(t.roundOff).toBe('0.25');
  });

  it('splits CGST and SGST', () => {
    const t = computeTotals([{ quantity: '1', rate: '38100' }], '12', 'CGST_SGST');
    expect(t.cgst).toBe('2286.00');
    expect(t.sgst).toBe('2286.00');
    expect(t.total).toBe('42672.00');
  });

  it('ignores unfinished lines instead of breaking', () => {
    const t = computeTotals([{ quantity: '', rate: '' }, { quantity: 'abc', rate: '5' }], '18', 'IGST');
    expect(t.total).toBe('0.00');
    expect(t.words).toBe('Zero');
  });
});

describe('invoice display formats (mirror the PDF)', () => {
  it('groups rupees the Indian way', () => {
    expect(indian('3163860.17')).toBe('31,63,860.17');
    expect(indian('3733355')).toBe('37,33,355.00');
    expect(indian(999)).toBe('999.00');
    expect(indian('1000')).toBe('1,000.00');
    expect(indian('12345678.5')).toBe('1,23,45,678.50');
    expect(indian('-0.28')).toBe('-0.28');
    expect(indian(null)).toBe('0.00');
  });

  it('shows a quantity as typed, up to four decimals', () => {
    expect(quantityText('1000.0000')).toBe('1,000');
    expect(quantityText('8304.0900')).toBe('8,304.09');
    expect(quantityText('8304.0948')).toBe('8,304.0948');
    expect(quantityText('120.5000')).toBe('120.5');
  });

  it('writes the date like the invoice does', () => {
    expect(ordinalDate('2026-08-24')).toBe('24th August 2026');
    expect(ordinalDate('2026-10-06')).toBe('6th October 2026');
    expect(ordinalDate('2026-08-01')).toBe('1st August 2026');
    expect(ordinalDate('2026-08-02')).toBe('2nd August 2026');
    expect(ordinalDate('2026-08-03')).toBe('3rd August 2026');
    expect(ordinalDate('2026-08-11')).toBe('11th August 2026');
  });
});
