import { Pipe, PipeTransform } from '@angular/core';

/**
 * Indian-rupee display helpers. Display only: amounts arrive from the API as decimal strings ("1234567.89")
 * and are formatted with string/BigInt arithmetic, never floating point.
 */

interface Parsed {
  negative: boolean;
  paise: bigint; // absolute amount in paise
}

function parse(value: string | number | null | undefined): Parsed | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    return null;
  }
  const [, sign, whole, frac = ''] = match;
  // round half-up to 2 decimals
  const digits = (frac + '000').slice(0, 3);
  let paise = BigInt(whole) * 100n + BigInt(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) {
    paise += 1n;
  }
  return { negative: sign === '-' && paise > 0n, paise };
}

/** 1234567 -> "12,34,567" (last three digits, then pairs). */
export function groupIndian(whole: string): string {
  if (whole.length <= 3) {
    return whole;
  }
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** "1234567.89" -> "₹12,34,568"; with `paise`: "₹12,34,567.89". Zero -> "₹0". Invalid -> "—". */
export function formatInr(value: string | number | null | undefined, mode: 'rupees' | 'paise' = 'rupees'): string {
  const parsed = parse(value);
  if (!parsed) {
    return '—';
  }
  const sign = parsed.negative ? '-' : '';
  if (mode === 'paise') {
    const whole = (parsed.paise / 100n).toString();
    const frac = (parsed.paise % 100n).toString().padStart(2, '0');
    return `${sign}₹${groupIndian(whole)}.${frac}`;
  }
  const rupees = (parsed.paise + 50n) / 100n; // half-up to whole rupees
  return `${rupees === 0n ? '' : sign}₹${groupIndian(rupees.toString())}`;
}

const UNITS: [bigint, string][] = [
  [10_000_000n, 'Cr'],
  [100_000n, 'L'],
  [1_000n, 'K'],
];

/** Compact Indian units: "₹1.2Cr", "₹12.3L", "₹4.5K", "₹850". One decimal, trailing ".0" dropped. */
export function formatInrCompact(value: string | number | null | undefined): string {
  const parsed = parse(value);
  if (!parsed) {
    return '—';
  }
  const sign = parsed.negative ? '-' : '';
  const rupees = (parsed.paise + 50n) / 100n;
  for (const [size, unit] of UNITS) {
    if (rupees >= size) {
      const tenths = (rupees * 10n + size / 2n) / size; // rounded to one decimal
      const whole = tenths / 10n;
      const frac = tenths % 10n;
      return `${sign}₹${groupIndian(whole.toString())}${frac === 0n ? '' : '.' + frac}${unit}`;
    }
  }
  return `${rupees === 0n ? '' : sign}₹${rupees}`;
}

@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(value: string | number | null | undefined, mode: 'rupees' | 'paise' = 'rupees'): string {
    return formatInr(value, mode);
  }
}

@Pipe({ name: 'inrCompact' })
export class InrCompactPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    return formatInrCompact(value);
  }
}
