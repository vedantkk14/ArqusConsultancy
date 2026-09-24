# API contract (v1)

Base path: `/api/v1/`. Live schema: `/api/schema/`, Swagger UI: `/api/docs/`.
Auth: `Authorization: Bearer <access>` unless marked *public*.
Lists are paginated (`?page`, `?page_size`) and errors use `{"error": {"code", "message", "details"}}`
(see ARCHITECTURE.md).

Status: ✅ implemented · 🔲 planned. Roles: A=Admin, SM=Sales Manager, SE=Sales Exec, PM=Project Manager.
Planned endpoints are proposals; the owner may refine them, but must update this file in the same PR.

## Core

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `GET /health` | public | `{"status": "ok"}` |

## Auth

All under `/api/v1/`. "public" endpoints ignore any `Authorization` header. Tokens are JWTs: access 15 min,
refresh 7 days, refresh **rotates** on every use and the old one is blacklisted.

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `POST /auth/login` | public | Throttled 20/min per IP; lockout after 5 failures per identifier + IP |
| ✅ | `POST /auth/refresh` | public | Rotation + blacklist |
| ✅ | `POST /auth/logout` | public | Blacklists the refresh token; always 204 |
| ✅ | `GET /me` | any | Current user |
| ✅ | `POST /auth/password/change` | any | Revokes all other sessions, returns new tokens |
| ✅ | `POST /auth/password/forgot` | public | Always the same 200; throttled 5/hour per IP |
| ✅ | `POST /auth/password/reset` | public | Single-use link; throttled 10/hour per IP |

**Login.** `identifier` is a username or an email (case-insensitive). The older `username` field is still accepted.

```http
POST /api/v1/auth/login
{"identifier": "admin@crm.local", "password": "Admin@123"}

200
{"access": "eyJ…", "refresh": "eyJ…", "must_change_password": false,
 "user": {"id": 1, "name": "Alice Admin", "email": "admin@crm.local", "role": "ADMIN", "must_change_password": false}}
```

**Refresh.** `{"refresh": "eyJ…"}` → `200 {"access": "eyJ…", "refresh": "eyJ… (new)"}`. Store the new refresh token;
the one you sent no longer works.

**Logout.** `{"refresh": "eyJ…"}` → `204` (also for a missing, invalid or already revoked token).

**Me.** `GET /me` → `{"id", "name", "email", "role", "must_change_password"}`.

**Change password** (Bearer token required):

```http
POST /api/v1/auth/password/change
{"old_password": "Welcome@123", "new_password": "A-much-better-one-7"}

200 {"access": "…", "refresh": "…", "user": {…, "must_change_password": false}, "must_change_password": false}
400 {"error": {"code": "validation_error", "message": "Validation failed.",
               "details": {"old_password": ["Your current password is incorrect."]}}}
400 … "details": {"new_password": ["This password is too common."]}
```

**Forgot password.** `{"email": "…"}` → always `200 {"message": "If that email is registered, we've sent a reset link."}`.
Active accounts get an email with `{FRONTEND_URL}/reset-password/{uid}/{token}` (valid `PASSWORD_RESET_TIMEOUT`
seconds, single use).

**Reset password.**

```http
POST /api/v1/auth/password/reset
{"uid": "MQ", "token": "c9x…", "new_password": "A-much-better-one-7"}

200 {"message": "Password updated. Sign in with your new password."}
400 {"error": {"code": "reset_link_invalid", …}}           bad, used or expired link
400 {"error": {"code": "validation_error", … "details": {"new_password": [...]}}}
```

A change or reset clears `must_change_password` and revokes every refresh token of the user.

### Auth error codes

| HTTP | `code` | When | `details` |
| --- | --- | --- | --- |
| 401 | `invalid_credentials` | Unknown account **or** wrong password (identical responses) | `{}` |
| 403 | `account_disabled` | Correct password, `is_active=False` | `{}` |
| 429 | `account_locked` | 5 failures for this identifier + IP; also refuses the right password until it ends | `{"retry_after": 900}` |
| 429 | `too_many_requests` | Per-IP throttle (login, forgot, reset) | `{"retry_after": 42}` |
| 401 | `token_invalid` | Refresh token (or access token) invalid, expired or revoked | `{}` or token info |
| 400 | `reset_link_invalid` | Reset uid/token wrong, used or expired | `{}` |
| 400 | `validation_error` | Missing fields, wrong current password, weak new password | field → messages |
| 401 | `not_authenticated` | Protected endpoint without a token | `{}` |

`retry_after` is in seconds.

## Leads (Dev A)

All under `/api/v1/leads`. Roles: A = Admin, SM = Sales Manager, SE = Sales Exec (own leads only; others
404). PM gets 403 everywhere. Money is a decimal string. Exec responses never contain `finance`, ledger,
payment, project or total keys.

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `GET /leads` | A, SM, SE | Paginated (20, max 100). Filters below |
| ✅ | `GET /leads/summary` | A, SM, SE | `by_status[{status,count,value}]`, `overdue`, `today`, `untouched`, `no_followup`, `won_awaiting`; honours `q`, `assigned_to`, `source`, `created_*` |
| ✅ | `POST /leads` | A, SM | 409 `duplicate_lead` `{existing:{id,name,status,assigned_to_name}}` unless `force=true` |
| ✅ | `GET /leads/check-duplicate?phone=&exclude=` | A, SM | `{existing: {...} | null}` |
| ✅ | `GET /leads/{id}` | A, SM, SE | Adds `allowed_transitions`, `interactions_count`; `finance {finalized,total_amount,finalized_at}` for A, SM |
| ✅ | `PATCH /leads/{id}` | A, SM (contact fields), SE (email, requirements, next_followup_at, proposed_amount) | Other keys -> 400. Amount change logs AMOUNT_CHANGE |
| ✅ | `DELETE /leads/{id}` | A | Soft delete; 409 `has_ledger` |
| ✅ | `POST /leads/{id}/status` | A, SM, SE | `{status, note?, lost_reason?, lost_note?, proposed_amount?, next_followup_at?}` |
| ✅ | `GET/POST /leads/{id}/interactions` | A, SM, SE | Append-only. POST `{type, notes, next_followup_at?, new_status?, lost_reason?, proposed_amount?}` |
| ✅ | `POST /leads/{id}/assign`, `POST /leads/bulk-assign` | A, SM | `{assigned_to}` / `{ids (max 100), assigned_to}`, atomic; assignee = active SALES_EXEC or ADMIN (an admin can own and close a lead) |
| ✅ | `GET /leads/assignees` | A, SM | `[{id, name, role, open_count}]` (execs and admins) |
| ✅ | `GET /leads/whatsapp-templates` | A, SM, SE | Active templates |
| ✅ | `GET /leads/{id}/whatsapp?template_id=` | A, SM, SE | Preview `{text, url}`; logs nothing |
| ✅ | `POST /leads/{id}/whatsapp` | A, SM, SE | `{template_id}` -> `{text, url}` (wa.me); writes MessageLog (OPENED) + WHATSAPP interaction |
| ✅ | `POST /leads/{id}/finalize` | A | `{amount, note?}`; 409 `accounts_not_ready` `{missing:[...]}` until Dev C ships the contract below |
| ✅ | `GET /leads/export` | A, SM | CSV of the filtered list, max 5000 rows, formula cells prefixed with `'` |

**List filters (contract with the dashboards' "View all" links):** `status` (comma list), `assigned_to`
(id or `none`), `source` (comma list), `q` (name, email, phone digits), `followup=overdue|today|upcoming|none`,
`open=true`, `untouched=true` (NEW with no interactions), `won_awaiting=true`, `created_from`, `created_to`
(YYYY-MM-DD, IST), `ordering` = `created_at`, `-created_at` (default), `name`, `next_followup_at`, `-days_overdue`,
`-proposed_amount`, `-last_activity_at`, `won_at`. Nulls sort last. Definitions (IST, `BUSINESS_TIME_ZONE`):
open = not WON/LOST; overdue = open and follow-up < now; today = open and follow-up between now and the end
of the business day (never overlaps overdue). Dashboards should import these from `apps/leads/selectors.py`.

**Status machine:** NEW -> CONTACTED | LOST; CONTACTED -> INTERESTED | WON | LOST; INTERESTED -> CONTACTED |
WON | LOST; WON -> none; LOST -> CONTACTED (A, SM only). WON needs `proposed_amount > 0`, sets `won_at`, clears
the follow-up, calls `create_ledger` once (repeat requests are no-ops) and notifies every active Admin
(`lead_won`). LOST needs `lost_reason` (PRICE, COMPETITOR, NO_RESPONSE, NOT_INTERESTED, REQUIREMENT_CHANGED,
OTHER). The first CALL / WHATSAPP / EMAIL / MEETING on a NEW lead moves it to CONTACTED; NOTE never does.

**Error codes:** `duplicate_lead` (409), `invalid_transition` (400, `{allowed, from, to}`), `followup_in_past`
(400, 5-minute tolerance), `followup_on_closed` (400), `accounts_not_ready` (409), `has_ledger` (409),
`not_won` (400), `phone_unusable` (400).

**Leads -> Accounts contract (Dev C must add):**
1. `accounts.Ledger` with `lead` (one-to-one to `leads.Lead`), `total_amount` Decimal(12,2) and a
   `finalized_at` DateTimeField (the finalization marker, null until finalized).
2. `accounts.services.create_ledger(lead)`: exists as a stub; make it create the Ledger idempotently.
3. `accounts.services.finalize_ledger(lead, amount, by)`: sets `total_amount`, `finalized_at`, audit log.
Once these exist, finalize, `won_awaiting`, `finance` and the `has_ledger` delete guard work with no leads change.
Notifications use `core.services.notify(user, type, payload)` with types `lead_assigned`,
`lead_reassigned_away`, `lead_won`.

## Accounts (Dev C)

Never accessible to PM.

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| 🔲 | `GET /accounts/ledgers` | A | Holds `total_amount` |
| 🔲 | `GET/PATCH /accounts/ledgers/{id}` | A | Finalise total amount |
| 🔲 | `GET/POST /accounts/payments` | A | |
| 🔲 | `GET /accounts/ledgers/{id}/statement` | A | Customer statement |
| 🔲 | `GET /accounts/pending-collections` | A, SM | |

## Projects (Dev B)

PM sees only own projects and only the sanctioned budget (see privacy shield).

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| 🔲 | `POST /projects` | A, SM | Convert a won lead |
| 🔲 | `GET /projects` | A, SM, PM | Filter by status; PM: own only, PM serializer |
| 🔲 | `GET/PATCH /projects/{id}` | A, SM, PM | PM: no `total_amount`, no lead data |
| 🔲 | `POST /projects/{id}/complete` | A, PM | |
| 🔲 | `POST /projects/{id}/reopen` | A | |
| 🔲 | `GET/POST /projects/{id}/expenses` | A, PM | |
| 🔲 | `GET /expenses` | A, PM | Filters: project, date, over-budget |
| 🔲 | `GET /expenses/budget-alerts` | A, PM | |

## Reports (Dev C)

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| 🔲 | `GET /reports/sales` | A, SM | |
| 🔲 | `GET /reports/financial-health` | A | |
| 🔲 | `GET /reports/project-margin` | A | |
| 🔲 | `GET /reports/lead-funnel` | A, SM | |

## Notifications (Dev C)

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| 🔲 | `GET /notifications` | any | Own notifications |
| 🔲 | `POST /notifications/{id}/read` | any | |
| 🔲 | `POST /notifications/read-all` | any | |

## Dashboard (Dev C)

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `GET /dashboard/admin?period=month\|quarter\|year\|all` | A | Admin home. 401 anonymous, 403 other roles, 400 bad period |

Response (money = string with 2 decimals; counts = integers; `received_delta_pct` = string or `null`):

```json
{
  "period": "month",
  "range": {"start": "2026-09-01", "end": "2026-09-24", "prev_start": "2026-08-01", "prev_end": "2026-08-31"},
  "data_sources": {"leads": false, "projects": false, "accounts": false, "expenses": false},
  "kpis": {
    "received": "0.00", "received_prev": "0.00", "received_delta_pct": null,
    "outstanding": "0.00", "outstanding_clients": 0, "outstanding_overdue": "0.00",
    "leads_total": 0, "leads_new": 0, "leads_new_prev": 0,
    "open_count": 0, "open_value": "0.00",
    "won_count": 0, "lost_count": 0, "win_rate_pct": "0.0",
    "projects_running": 0, "projects_completed": 0,
    "spent": "0.00", "net": "0.00", "net_margin_pct": "0.0", "collection_rate_pct": "0.0"
  },
  "trends": {"months": ["2026-04", "…", "2026-09"], "leads_new": [0, 0, 0, 0, 0, 0], "received": ["0.00", "…"]},
  "cashflow": {"months": ["2026-04", "…"], "collected": ["0.00", "…"], "spent": ["0.00", "…"], "net": ["0.00", "…"]},
  "attention": [{"key": "overdue_payments", "label": "Payments overdue", "count": 4, "severity": "high", "route": "/accounts/pending"}],
  "funnel": [{"status": "NEW", "label": "New", "count": 64, "value": "9600000.00"}],
  "sales_by_exec": [{"user_id": 3, "name": "Eva Exec", "won_count": 7, "won_value": "3240000.00",
                     "share_pct": "100.0", "win_rate_pct": "70.0"}],
  "lead_sources": [{"source": "Referral", "count": 48, "pct": "31.2"}],
  "collections_aging": [{"bucket": "0-30", "count": 0, "amount": "0.00"}, {"bucket": "31-60", …},
                        {"bucket": "61-90", …}, {"bucket": "90+", …}],
  "top_overdue_clients": [{"ledger_id": 12, "client": "…", "outstanding": "420000.00", "days": 97}],
  "projects_burn": [{"id": 5, "name": "…", "sanctioned": "800000.00", "spent": "840000.00",
                     "pct": "105.0", "state": "over"}],
  "recent": {
    "payments": [{"date": "2026-09-23", "client": "…", "reference": "…", "amount": "250000.00"}],
    "expenses": [{"date": "2026-09-22", "project": "…", "category": "…", "amount": "185000.00"}],
    "activity": [{"when": "2026-09-24T09:40:00Z", "actor": "…", "action": "…", "type": "payment"}]
  }
}
```

Definitions (each is one named function/constant in `apps/reports/services.py`):

- **Periods** follow the Indian financial year (April-March): month / FY quarter / FY year to date, compared with
  the full previous period of the same kind. `all` has no comparison.
- **Open lead** (active opportunity) = status not `WON` and not `LOST`; `open_value` = sum of `proposed_amount`
  (missing = 0).
- `win_rate_pct` = won / (won + lost) in the period, one decimal; `"0.0"` when nothing was decided.
- `received_delta_pct` = % change vs the previous period; `null` when the previous value is 0 or period is `all`.
- Projects running = status not Completed; completed = Completed. Snapshots, not period-based.
- Outstanding figures are snapshots as of now; **overdue** = ledger older than 30 days (`OVERDUE_AFTER_DAYS`).
- `leads_total` is the all-time snapshot; `leads_new` is the period figure.
- `attention` lists only counts above zero, most severe first.
- `spent` / `net` = expenses and received minus expenses in the period; `net_margin_pct` = net / received.
- `collection_rate_pct` = all money received / total finalized project value (snapshot).
- `collections_aging`: unpaid ledgers by days since the last payment (or ledger creation), buckets
  0-30 / 31-60 / 61-90 / 90+ (always all four); `top_overdue_clients`: the 3 oldest.
- `projects_burn`: up to 5 running projects by spent / **sanctioned budget** (never the total amount);
  `state` = `ok` below 80%, `warn` from 80%, `over` from 100%.
- `sales_by_exec[].share_pct` = won value / the top exec's won value; `lead_sources` = top 5 + "Other".
- Note: these live at the top level (`cashflow`, `funnel`, …), not under a `charts` key.

**Status:** the endpoint, shape and definitions are implemented and tested. The figures are real zeros until the
`leads.Lead`, `projects.Project/Expense` and `accounts.Ledger/Payment` models exist (`data_sources` says which are
connected). Each block has a `TODO(depends on …)` in `services.py` describing the aggregate to add. The frontend
dev build uses a typed fixture (`environment.useMocks`) meanwhile.
