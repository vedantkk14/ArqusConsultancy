import { formatPhone, localPart, normalizePhone, toTelHref, toWhatsappHref } from './phone';

describe('phone helpers (mirror the backend)', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('normalises %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(['', '12345', '5876543210', '442079460958', '+1234567'])('rejects %s', (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });

  it('formats and extracts the local part', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('+442079460958')).toBe('+442079460958');
    expect(localPart('+91 98765-43210')).toBe('9876543210');
    expect(localPart('098765 43210')).toBe('9876543210');
  });

  it('builds call and WhatsApp links', () => {
    expect(toTelHref('98765 43210')).toBe('tel:+919876543210');
    expect(toWhatsappHref('+919876543210', 'Hi Rahul & co')).toBe('https://wa.me/919876543210?text=Hi%20Rahul%20%26%20co');
    expect(toWhatsappHref('+919876543210')).toBe('https://wa.me/919876543210');
    expect(toTelHref('123')).toBeNull();
    expect(toWhatsappHref('123')).toBeNull();
  });
});
