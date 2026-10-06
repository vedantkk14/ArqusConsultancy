import { TaxType } from './invoice.models';

/** Live totals while the invoice is being typed. The server recalculates and has the last word. */

export interface Totals {
  amounts: string[];
  subtotal: string;
  tax: string;
  cgst: string;
  sgst: string;
  roundOff: string;
  total: string;
  words: string;
}

const EPS = 1e-7;
const cents = (value: number): number => Math.floor(value + 0.5 + EPS);
const fixed = (centsValue: number): string => (centsValue / 100).toFixed(2);

function num(text: string): number {
  const value = Number(String(text).replace(/,/g, '').trim());
  return Number.isFinite(value) ? value : 0;
}

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) {
    return belowHundred(rest);
  }
  return rest ? `${ONES[hundreds]} Hundred And ${belowHundred(rest)}` : `${ONES[hundreds]} Hundred`;
}

/** Indian system, whole rupees: 3733355 is "Thirty Seven Lakh Thirty Three Thousand Three Hundred And Fifty Five". */
export function inWords(rupees: number): string {
  let n = Math.round(rupees);
  if (n <= 0) {
    return 'Zero';
  }
  const parts: string[] = [];
  for (const [size, name] of [[10_000_000, 'Crore'], [100_000, 'Lakh'], [1_000, 'Thousand']] as const) {
    const count = Math.floor(n / size);
    n %= size;
    if (count) {
      parts.push(`${belowHundred(count)} ${name}`);
    }
  }
  if (n) {
    parts.push(belowThousand(n));
  }
  return parts.join(' ');
}

export function computeTotals(
  lines: { quantity: string; rate: string }[],
  gstPercent: string,
  taxType: TaxType,
): Totals {
  const amountCents = lines.map((l) => cents(num(l.quantity) * num(l.rate) * 100));
  const subtotal = amountCents.reduce((a, b) => a + b, 0);
  const pct = num(gstPercent);
  const tax = pct > 0 ? cents((subtotal * pct) / 100) : 0;
  const cgst = taxType === 'CGST_SGST' ? cents(tax / 2) : 0;
  const sgst = taxType === 'CGST_SGST' ? tax - cgst : 0;
  const raw = subtotal + tax;
  const total = Math.floor(raw / 100 + 0.5 + EPS) * 100;
  return {
    amounts: amountCents.map(fixed),
    subtotal: fixed(subtotal),
    tax: fixed(tax),
    cgst: fixed(cgst),
    sgst: fixed(sgst),
    roundOff: fixed(total - raw),
    total: fixed(total),
    words: inWords(total / 100),
  };
}

/** 31,63,860.17: lakh and crore grouping with two decimals (the same as the PDF). */
export function indian(value: string | number | null | undefined): string {
  const text = Number(value ?? 0).toFixed(2);
  const negative = text.startsWith('-');
  const [whole, paise] = text.replace('-', '').split('.');
  let head = whole.length > 3 ? whole.slice(0, -3) : '';
  const tail = whole.length > 3 ? whole.slice(-3) : whole;
  const groups: string[] = [];
  while (head.length > 2) {
    groups.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) {
    groups.unshift(head);
  }
  return `${negative ? '-' : ''}${[...groups, tail].join(',')}.${paise}`;
}

/** As typed: up to four decimals, trailing zeros dropped (100, 8,304.09, 8,304.0948). */
export function quantityText(value: string): string {
  const [whole, frac = ''] = Number(value).toFixed(4).split('.');
  const trimmed = frac.replace(/0+$/, '');
  return indian(whole).replace(/\.00$/, '') + (trimmed ? `.${trimmed}` : '');
}

/** 24th August 2026. */
export function ordinalDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDate();
  const suffix = day >= 10 && day <= 20 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${day}${suffix} ${d.toLocaleString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
}
