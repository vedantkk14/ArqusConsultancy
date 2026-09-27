/** Mirrors backend apps/leads/utils.normalize_phone. Returns null when the number is unusable. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  const hasPlus = text.startsWith('+');
  let digits = text.replace(/\D/g, '');
  if (!hasPlus && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (!hasPlus && digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && /^91[6-9]/.test(digits)) {
    return `+${digits}`;
  }
  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

/** "+919876543210" -> "+91 98765 43210"; other numbers are shown as stored. */
export function formatPhone(phone: string | null | undefined): string {
  const value = phone ?? '';
  const match = /^\+91(\d{5})(\d{5})$/.exec(value);
  return match ? `+91 ${match[1]} ${match[2]}` : value;
}

/**
 * The 10 local digits for the "+91" input, from whatever was pasted:
 * "+91 98765-43210", "098765 43210", "919876543210" -> "9876543210". Other input keeps its digits.
 */
export function localPart(raw: string): string {
  const normalized = normalizePhone(raw);
  if (normalized?.startsWith('+91')) {
    return normalized.slice(3);
  }
  return raw.replace(/[^\d+]/g, '');
}

export function toTelHref(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone);
  return normalized ? `tel:${normalized}` : null;
}

/** wa.me link, optionally with pre-filled text. null when the number is unusable. */
export function toWhatsappHref(phone: string | null | undefined, text = ''): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return null;
  }
  const digits = normalized.slice(1);
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}
