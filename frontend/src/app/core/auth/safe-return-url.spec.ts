import { safeReturnUrl } from './safe-return-url';

describe('safeReturnUrl', () => {
  it.each(['/leads?x=1', '/dashboard', '/projects/running#top', '/leads/all?status=open&page=2'])(
    'accepts the internal path %s',
    (url) => expect(safeReturnUrl(url)).toBe(url),
  );

  it.each([
    '//evil.com',
    'https://evil.com',
    'http://evil.com/leads',
    '/\\evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,hi',
    'leads',
    '',
    ' //evil.com',
    '/\tevil',
    '/login',
    '/login?returnUrl=/x',
    '/reset-password/a/b',
  ])('rejects %j', (url) => expect(safeReturnUrl(url)).toBeNull());

  it('rejects non-strings', () => {
    expect(safeReturnUrl(null)).toBeNull();
    expect(safeReturnUrl(undefined)).toBeNull();
    expect(safeReturnUrl(['/leads'])).toBeNull();
  });
});
