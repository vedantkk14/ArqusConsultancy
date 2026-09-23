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
