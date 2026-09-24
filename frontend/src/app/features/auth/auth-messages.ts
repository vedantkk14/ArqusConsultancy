import { ApiError } from '../../core/models';

/** User-facing text for auth API errors. Never shows raw server messages. */
export const AUTH_MESSAGES = {
  invalid_credentials: 'Incorrect email or password.',
  account_disabled: 'This account is disabled. Contact your administrator.',
  account_locked: 'Too many failed attempts.',
  too_many_requests: 'Too many attempts from this device.',
  network_error: "Can't reach the server. Check your connection and try again.",
  reset_link_invalid: 'This reset link is invalid or has expired.',
  fallback: 'Something went wrong. Please try again.',
} as const;

/** Codes that come with `details.retry_after` and lock the form until it passes. */
export function retryAfter(err: ApiError): number | null {
  if (err.code !== 'account_locked' && err.code !== 'too_many_requests') {
    return null;
  }
  const seconds = Number(err.details?.['retry_after']);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
}

export function authErrorMessage(err: ApiError | null | undefined): string {
  const code = err?.code ?? '';
  return (AUTH_MESSAGES as Record<string, string>)[code] ?? AUTH_MESSAGES.fallback;
}

/** First message for `field` in a validation_error's details, if any. */
export function fieldError(err: ApiError | null | undefined, field: string): string | null {
  const messages = err?.details?.[field];
  return Array.isArray(messages) && messages.length ? String(messages[0]) : null;
}
