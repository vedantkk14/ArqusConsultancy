# Architecture

## Module map

| App | Owner | Responsibility |
| --- | --- | --- |
| `core` | shared | `TimeStampedModel`, `SoftDeleteModel`, role permissions, pagination, error handler, `notify()` stub, `seed_demo_data` |
| `users` | shared | Custom `User` (role, phone, commission_rate), JWT login/refresh, `/me` |
| `leads` | Dev A | Leads, follow-ups, marking a lead Won |
| `projects` | Dev B | Projects, sanctioned budget, expenses, PM-facing API |
| `accounts` | Dev C | `Ledger` (owns the Total Project Amount), payments, statements |
| `notifications` | Dev C | In-app notifications, WhatsApp links |
| `reports` | Dev C | Reports and the admin dashboard |

Flow: `leads` marks a lead Won → calls `accounts.services.create_ledger(lead)` → `projects` creates a project
from the won lead → `accounts` records payments, `projects` records expenses → `reports` computes margin.

**Rules between apps**

- Reference other apps' models with strings: `models.ForeignKey("leads.Lead", ...)`.
- Cross-app work goes through the other app's `services.py`, never by importing its models or serializers.
- Views stay thin; business logic lives in `services.py`.
- Every app's `urls.py` is mounted under `/api/v1/` in `config/urls.py`.

## Privacy shield

**Rule:** the Total Project Amount is stored in exactly one place, `accounts.Ledger.total_amount`.
A `PROJECT_MANAGER` never sees it, nor lead data or payments. They see only the Sanctioned Budget on
projects assigned to them.

Design:

1. **One home for the number.** `total_amount` exists only on `accounts.Ledger`. It is not copied to
   `Lead` or `Project`. `Project` holds `sanctioned_budget` (a separate, PM-visible figure).
2. **Separate serializers per audience.** Projects have a PM serializer (`PMProjectSerializer`) with an
   explicit allow-list of fields. Never use `fields = "__all__"` or `exclude = [...]` on anything a PM can reach.
   The view picks the serializer from `request.user.role`.
3. **Scoped querysets.** A PM's queryset is limited to projects assigned to them (others return 404, not 403).
4. **Role permissions.** All `accounts` endpoints and lead endpoints use `HasRole(...)` without
   `PROJECT_MANAGER`. Permission classes live in `apps/core/permissions.py`.
5. **No side channels.** Error messages, filters/ordering (`?ordering=total_amount`), search fields, OpenAPI
   examples, notification payloads and logs must not expose the total to a PM.
6. **Leak tests.** `apps/projects/tests/test_pm_privacy.py` (Dev B) asserts recursively that no PM response
   contains `total_amount`, lead data or payments. Any new PM-reachable endpoint needs a case there.

The frontend hides Accounts/Reports/Team from a PM in the sidebar and guards the routes, but that is
convenience only. **The backend is the security boundary.**

## Authentication

**Tokens.** SimpleJWT: access token 15 min (`JWT_ACCESS_MINUTES`), refresh token 7 days (`JWT_REFRESH_DAYS`).
Every refresh **rotates**: the client gets a new refresh token and the old one is blacklisted
(`token_blacklist` app), so a stolen refresh token stops working as soon as either party uses it. Logout
blacklists the refresh token; a password change or reset blacklists **all** of the user's refresh tokens (every
device). An access token that was already issued stays valid until it expires (at most 15 minutes).

**Endpoints and error codes:** see `docs/API_CONTRACT.md` (Auth). Code lives in `apps/users/services.py`;
views stay thin.

**No account enumeration.**
- Wrong password and unknown account return the same 401 `invalid_credentials` and message. An unknown account
  still pays for one password hash, so response times are similar.
- `account_disabled` (403) is only returned when the password is right.
- Forgot password always returns the same 200 message. Known limitation: sending the email makes a known address
  a little slower to answer; move sending to a background job if that ever matters.

**Brute force.**
- Per-IP throttles (DRF scoped): login 20/min, forgot 5/hour, reset 10/hour. They answer 429 `too_many_requests`
  with `retry_after`.
- Lockout: `LOGIN_MAX_ATTEMPTS` (5) consecutive failures for the same *lowercased identifier + IP* lock that pair
  for `LOGIN_LOCKOUT_MINUTES` (15), answering 429 `account_locked` with `retry_after`, even for the right password.
  A success clears the counter. Keys are SHA-256 hashed.
- **Cache caveat:** throttles and lockouts live in Django's cache. The default `LocMemCache` is per process, so
  with several workers each keeps its own counters (an attacker gets N x the attempts). In production use a
  shared cache, e.g. the database cache: `python manage.py createcachetable` and
  `CACHES = {"default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": "django_cache"}}`.
- Behind a reverse proxy, set DRF `NUM_PROXIES` so throttles see the real client IP.

**Password reset.** Django's `default_token_generator` with a urlsafe base64 uid:
`{FRONTEND_URL}/reset-password/{uid}/{token}`. The token hashes the current password and last login, so it works
once and dies when the password changes; it expires after `PASSWORD_RESET_TIMEOUT` seconds (1 hour). Validators:
Django's four defaults, minimum length 8.

**Forced change.** `User.must_change_password` is set by `apps.users.services.set_temporary_password()` (for the
Team module when an admin creates a user or resets a password). The frontend guard sends such a user to
`/account/change-password?forced=true` and allows no other page until it is done.

**Where the browser keeps tokens (and the XSS trade-off).** Tokens are in Web Storage, behind the `TokenStorage`
interface (`frontend/src/app/core/auth/token-storage.ts`):
- "Remember me" on: `localStorage` (survives restarts, shared across tabs).
- "Remember me" off: `sessionStorage` (this tab only). Storage blocked: memory.
- Web Storage is readable by any script on the page, so an XSS bug could steal tokens. We accept that for a
  stateless, mobile-ready API and limit the damage: short-lived access tokens, rotating and revocable refresh
  tokens, Angular's built-in escaping, no `innerHTML` with user data, and no third-party scripts. Tokens are never
  put in URLs, query strings or logs (reset links carry a one-time token, not a JWT).
- The move to httpOnly cookies would need CSRF protection and is not planned for v1.

**Frontend behaviour.** The interceptor adds the token only to requests for our API base URL and never to the
public auth endpoints. A 401 triggers one shared ("single-flight") refresh; waiting requests retry once; if the
refresh fails the session is cleared and the user goes to `/login?reason=expired&returnUrl=…`. If another tab
rotated the token in the meantime, its new token is used instead of signing out. Tabs stay in sync through a
`storage` event (sign-out everywhere; a "Remember me" sign-in is picked up by open tabs). `returnUrl` is only
followed when `safeReturnUrl()` accepts it (internal paths only). On startup the stored session is checked with
`GET /me` behind a logo splash, so the login page never flashes.

**Mobile.** The Capacitor app will provide a secure-storage (Keychain / Keystore) implementation of
`TokenStorage` via `{ provide: TokenStorage, useClass: … }`. `AuthService` and the interceptor don't change.

## Mobile-ready API rules

- **Stateless JWT.** `Authorization: Bearer <access>`; no sessions, no CSRF for `/api/v1/`.
  Access token is short-lived, refresh via `POST /api/v1/auth/refresh`.
- **Versioned.** Everything under `/api/v1/`. Breaking changes go to `/api/v2/`.
- **Paginated lists.** `?page=1&page_size=20` (default 20, max 100) →
  `{"count", "next", "previous", "results"}`.
- **Consistent errors.** Every error, including 401/403/404/500, has the same body:
  ```json
  {"error": {"code": "validation_error", "message": "Validation failed.", "details": {"phone": ["Required."]}}}
  ```
- **JSON only**, ISO-8601 UTC timestamps (`USE_TZ=True`, `TIME_ZONE="UTC"`).
- **Filtering** via `django-filter`; OpenAPI at `/api/schema/`, Swagger UI at `/api/docs/`.

## Money rule

**All money uses `DecimalField(max_digits=12, decimal_places=2)`. Never floats.**

- In models, serializers (`DecimalField`), services and tests. Build test values from strings: `Decimal("10.50")`.
- Amounts travel over the API as strings (`"10500.00"`), which is DRF's default for decimals.
- Percentages (e.g. `commission_rate`) use `DecimalField(max_digits=5, decimal_places=2)`.
- Round with `Decimal.quantize(Decimal("0.01"))` at the end of a calculation, not in the middle.
- Frontend: treat amounts as strings/decimals; never accumulate with floating-point arithmetic.

## Other conventions

- **Soft delete** (`SoftDeleteModel`): `Model.objects` hides deleted rows; `Model.all_objects` shows all.
  Money records should use it (see OPEN_DECISIONS).
- **Settings:** one `config/settings.py`; every environment-specific value comes from `.env`.
- **Frontend navigation:** `frontend/src/app/core/config/sidebar.config.ts` is the single source for both
  the sidebar and route access. Each `features/<area>/<area>.routes.ts` builds placeholder routes from it.
