const AUTH_PAGES = /^\/(login|forgot-password|reset-password)(\/|\?|#|$)/;

/**
 * `value` if it is a safe in-app path to go back to after sign-in, otherwise null.
 *
 * Accepts only internal paths starting with a single "/". Rejects protocol-relative ("//host"), any
 * scheme ("https:", "javascript:"), backslashes (browsers treat "/\host" as "//host"), control
 * characters, and the auth pages themselves (they would just bounce).
 */
export function safeReturnUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const url = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\') || /[\u0000-\u001f\u007f]/.test(url)) {
    return null;
  }
  if (AUTH_PAGES.test(url)) {
    return null;
  }
  try {
    // Last line of defence: resolving against a dummy origin must stay on that origin.
    return new URL(url, 'https://app.invalid').origin === 'https://app.invalid' ? url : null;
  } catch {
    return null;
  }
}
