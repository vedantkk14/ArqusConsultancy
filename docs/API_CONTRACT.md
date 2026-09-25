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

## Users (Admin)

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `POST /users` | A | Create an account for any role. Body: `username`, `email`, `first_name`, `last_name`, `phone?`, `role` (ADMIN, SALES_MANAGER, SALES_EXEC, PROJECT_MANAGER), `password` (temporary, checked by the password validators), `must_change_password?` (default true). Returns `{id, name, email, role, must_change_password}`. Field errors for a taken username or email and for weak passwords. The new user signs in with the username or the email, and with `must_change_password` is sent to the change-password page first. |

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
| ✅ | `GET /dashboard/sales-manager?period=month\|quarter\|year\|all` | SM only | Team dashboard - see below |
| ✅ | `GET /dashboard/sales-exec?period=month\|quarter\|year\|all` | SE only | Own-leads dashboard - see below |

**List filters (contract with the dashboards' "View all" links):** `status` (comma list), `assigned_to`
(id or `none`), `source` (comma list), `q` (name, email, phone digits), `followup=overdue|today|upcoming|none`,
`open=true`, `untouched=true` (NEW with no interactions), `won_awaiting=true`, `created_from`, `created_to`
(YYYY-MM-DD, IST), `ordering` = `created_at`, `-created_at` (default), `name`, `next_followup_at`, `-days_overdue`,
`-proposed_amount`, `-last_activity_at`, `won_at`, `-won_at`. Nulls sort last. Definitions (IST, `BUSINESS_TIME_ZONE`):
open = not WON/LOST; overdue = open and follow-up < now; today = open and follow-up between now and the end
of the business day (never overlaps overdue). Dashboards should import these from `apps/leads/selectors.py`.

**Status machine:** NEW -> CONTACTED | LOST; CONTACTED -> INTERESTED | WON | LOST; INTERESTED -> WON | LOST (no
way back to Contacted); WON -> LOST (A, SM only, and only before any payment: 409 `has_payments`); LOST -> CONTACTED
(reopen, A, SM only). A won lead that is marked lost loses `won_at`, its ledger is cancelled through
`accounts.services.cancel_ledger(lead)` and every Admin gets `lead_won_reversed`. WON needs `proposed_amount > 0`, sets `won_at`, clears
the follow-up, calls `create_ledger` once (repeat requests are no-ops) and notifies every active Admin
(`lead_won`). LOST needs `lost_reason` (PRICE, COMPETITOR, NO_RESPONSE, NOT_INTERESTED, REQUIREMENT_CHANGED,
OTHER). The first CALL / WHATSAPP / EMAIL / MEETING on a NEW lead moves it to CONTACTED; NOTE never does.

**Error codes:** `duplicate_lead` (409), `invalid_transition` (400, `{allowed, from, to}`), `followup_in_past`
(400, 5-minute tolerance), `followup_on_closed` (400), `accounts_not_ready` (409), `has_ledger` (409),
`not_won` (400), `phone_unusable` (400), `has_payments` (409).

**UI lists:** All leads = `open=true` (Won and Lost are not shown there); Won leads = `status=WON` (optionally
`won_awaiting=true`); Lost leads = `status=LOST`; Overdue = `followup=overdue`. List rows carry `finalized`
(true/false) for Admin and Sales Manager only; it is absent for Sales Execs.

**Leads -> Accounts contract (Dev C must add):**
1. `accounts.Ledger` with `lead` (one-to-one to `leads.Lead`), `total_amount` Decimal(12,2) and a
   `finalized_at` DateTimeField (the finalization marker, null until finalized).
2. `accounts.services.create_ledger(lead)`: exists as a stub; make it create the Ledger idempotently.
3. `accounts.services.finalize_ledger(lead, amount, by)`: sets `total_amount`, `finalized_at`, audit log.
4. `accounts.services.cancel_ledger(lead)`: called when a won lead is marked lost (no-op until it exists), and an
   `accounts.Payment` with `ledger.lead`, so leads can refuse "lost" once a payment exists (`has_payments`).
Once these exist, finalize, `won_awaiting`, `finance` and the `has_ledger` delete guard work with no leads change.
Notifications use `core.services.notify(user, type, payload)` with types `lead_assigned`,
`lead_reassigned_away`, `lead_won`.

### Sales Manager dashboard

`GET /dashboard/sales-manager?period=month|quarter|year|all` (registered in `apps/leads/urls.py`; default
`month`). SALES_MANAGER only -
401 anonymous, 403 for ADMIN, SALES_EXEC and PROJECT_MANAGER, 400 for a bad `period`. Team-scoped: leads
owned by any active SALES_EXEC. Manager sees each lead's `proposed_amount` only, exactly like the rest of
the Leads API - never a ledger, payment, project or final/total amount, not even as `null`. Definitions
(open, overdue, due today, won-awaiting, business day) come from `apps/leads/selectors.py`, identical to
the rest of the Leads API. "Lost within the period" is `status=LOST` + `updated_at` (see
docs/OPEN_DECISIONS.md #26 - `Lead` has no `lost_at`).

```json
{
  "as_of": "2026-09-24T19:03:34.662Z",
  "business_date": "2026-09-25",
  "period": {"key": "month", "from": "2026-09-01", "to": "2026-09-24"},
  "kpis": {
    "team_open_leads": 27, "team_new_untouched": 3, "team_followups_today": 0, "team_overdue": 14,
    "team_won_count": 9, "team_lost_count": 5, "team_conversion_pct": "64.3", "team_won_value": "2226000.00",
    "unassigned_leads": 5
  },
  "queues": {
    "overdue": {"total": 14, "items": [{"id": 4, "name": "Deccan Sports Academy", "phone": "+919800000003",
      "status": "CONTACTED", "source_label": "Facebook", "next_followup_at": "2026-09-18T12:13:20Z",
      "days_overdue": 7, "proposed_amount": "225000.00", "last_note": "Discussed scope and timelines.",
      "assigned_to": {"id": 3, "name": "Eva Exec"}}]},
    "today": {"total": 0, "items": []},
    "unassigned": {"total": 5, "items": [{"...": "same shape, no `assigned_to` key"}]},
    "won_awaiting": {"total": 0, "items": []}
  },
  "by_executive": [{"id": 3, "name": "Eva Exec", "open_leads": 8, "overdue": 4, "won_count": 4,
    "won_value": "1250000.00", "conversion_pct": "66.7", "load_score": 16}],
  "pipeline": [{"status": "NEW", "count": 10}, {"status": "CONTACTED", "count": 10},
               {"status": "INTERESTED", "count": 6}, {"status": "WON", "count": 7}, {"status": "LOST", "count": 5}],
  "recent_activity": [{"at": "2026-09-24T14:13:20Z", "exec_name": "Rohan Mehta", "lead_id": 35,
    "lead_name": "Ratnagiri Rowing Club", "type": "MEETING", "text": "Shared the brochure and past projects."}]
}
```

### Sales Exec dashboard

`GET /dashboard/sales-exec?period=month|quarter|year|all` (registered in `apps/leads/urls.py`; default
`month`). SALES_EXEC only - 401 anonymous, 403 for ADMIN, SALES_MANAGER and PROJECT_MANAGER, 400 for a
bad `period`. Scoped to this Exec's own leads (`selectors.leads_for(user)`); shares its KPI/period math
with the Sales Manager dashboard through `apps/leads/dashboard_common.py` (`base_kpis`, `pipeline_counts`,
`queue`) - neither restates the other's aggregates. Sees `proposed_amount` only, same privacy shield as
everywhere else in Leads. `SHOW_COMMISSION_TO_EXEC` (default `False`, see docs/OPEN_DECISIONS.md #27)
adds `kpis.estimated_commission` when on.

```json
{
  "as_of": "2026-09-24T20:48:44.485Z",
  "business_date": "2026-09-25",
  "period": {"key": "all", "from": null, "to": "2026-09-24"},
  "kpis": {
    "open_leads": 8, "new_untouched": 1, "followups_today": 0, "overdue": 4,
    "won_count": 6, "lost_count": 2, "conversion_pct": "75.0", "won_value": "1321456.00"
  },
  "queues": {
    "overdue": {"total": 4, "items": [{"id": 4, "name": "Deccan Sports Academy", "phone": "+919800000003",
      "source": "FACEBOOK", "status": "CONTACTED", "created_at": "2026-07-14T08:13:20Z",
      "next_followup_at": "2026-09-18T12:13:20Z", "days_overdue": 7,
      "last_note": "Discussed scope and timelines.", "last_interaction_at": "2026-07-24T09:13:20Z",
      "proposed_amount": "225000.00"}]},
    "today": {"total": 0, "items": []},
    "new_leads": {"total": 1, "items": [{"...": "same shape; proposed_amount is null until proposed"}]},
    "no_followup": {"total": 3, "items": []}
  },
  "pipeline": [{"status": "NEW", "count": 4}, {"status": "CONTACTED", "count": 2},
               {"status": "INTERESTED", "count": 2}, {"status": "WON", "count": 6}, {"status": "LOST", "count": 2}],
  "upcoming": [{"date": "2026-10-02", "count": 1, "items": [{"...": "lead item, max 5/day"}]}],
  "recent_activity": [{"at": "2026-09-16T23:13:20Z", "lead_id": 16, "lead_name": "Karan Mehta",
    "type": "EMAIL", "text": "Shared the brochure and past projects."}]
}
```

`upcoming` covers the next 7 business days after today (business timezone), grouped by the date the
follow-up actually falls on in that timezone - not UTC's date - and only includes days with at least
one lead; each day is capped at 5 items with `count` still showing the day's real total. `last_note` is
truncated to 80 characters. Query budget: 9 measured, under 15.

`by_executive` includes every active SALES_EXEC, even one with zero leads (all zeros, never omitted); an
exec whose `overdue` exceeds 3 gets an amber highlight in the UI ("overdue > 3", not a performance verdict).
`load_score = open_leads + overdue*2`, sort key only, not shown as a formula.

## Accounts (Dev C)

Never accessible to PM.

### Lead import (Excel / CSV)

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `POST /leads/import` | A, SM | `multipart/form-data`, field `file` (.xlsx or .csv, up to 2 MB and 1,000 rows). `?dry_run=1` only checks. Columns (headers are matched loosely): Name and Phone required; Email, Source, Assigned to (email or full name), Requirements, Proposed value optional. Returns `{dry_run, total, ready, created, duplicate_count, error_count, duplicates: [{row, name, phone, reason}], errors: [...]}` (first 50 of each listed). Bad rows and duplicate phones (existing or repeated in the file) are skipped, never fatal. 400 `{file: [...]}` for an unusable file. |
| ✅ | `GET /leads/import-template` | A, SM | The .xlsx template with an example row and a Notes sheet. |

## Accounts (Dev B)

**Admin only, everywhere.** Anonymous requests get 401 and every other role 403, with an error body that never
carries an amount. Money is a decimal string ("1234.50"), never a number. Only **finalized** ledgers count in
outstanding, collection rate and aging. Routes have no trailing slash.

| Status | Method & path | Notes |
| --- | --- | --- |
| ✅ | `GET /ledgers` | Paginated (20). Row: `id, lead, client, phone, exec_name, state, state_label, finalized, is_overdue, total, received, outstanding, collected_pct, days_since, last_payment_on, created_at` |
| ✅ | `GET /ledgers/summary` | `total_value, received, outstanding, overdue_amount, clients_with_balance, overdue_clients, collection_rate_pct, awaiting_finalization, counts{state}, aging[{bucket,count,amount}], top_overdue[3]`. Accepts `q`, `created_from`, `created_to` |
| ✅ | `GET /ledgers/options?q=` | Up to 10 finalized ledgers with a balance (the record-payment select) |
| ✅ | `GET /ledgers/{id}` | Row + `lead_block`, `project` (id, name, status, sanctioned_budget, spent, planned_margin, live_margin, or null), `finalized_at/by/note`, `proposed_amount`, `allowed_actions` |
| ✅ | `POST /ledgers/{id}/finalize` | `{amount, note?}`. Sets the total, notifies the exec (`deal_finalized`, no amounts). Twice: 409 `already_finalized` |
| ✅ | `POST /ledgers/{id}/revise-total` | `{amount, reason}`, finalized only. Not below received (`total_below_received`) or the linked project's sanctioned budget (`total_below_budget`) |
| ✅ | `POST /ledgers/{id}/reminder` | Returns `{text, url}` (a `wa.me` link) and logs `REMINDER_SENT`. Unusable phone: 400 `invalid_phone` |
| ✅ | `GET/POST /ledgers/{id}/payments` | POST is `multipart/form-data`: `amount, mode, reference, received_on, note?, proof?, confirm_duplicate?` |
| ✅ | `GET /ledgers/{id}/events` | Append-only timeline, newest first, paginated |
| ✅ | `GET /ledgers/{id}/statement?from&to&format=json\|csv` | Deal total, active payments as credits with a running balance. Never the sanctioned budget, expenses or margin |
| ✅ | `GET /ledgers/export` | CSV, at most 5000 rows, current filters, formula-prefix |
| ✅ | `GET /payments` | Paginated. Filters below |
| ✅ | `GET /payments/summary` | `{total, count, void_count, by_mode[]}` for the current filters; void payments are never counted |
| ✅ | `GET /payments/{id}` | Adds `balance_after`, `amount_in_words`, `client_phone`, `company` (the receipt) |
| ✅ | `POST /payments/{id}/void` | `{reason}`, any age. The row stays visible with `is_void` |
| ✅ | `GET /payments/{id}/proof` | The file, inline, `nosniff`, `Cache-Control: private, no-store`. No public URL: fetch with the JWT and show from a blob |
| ✅ | `GET /payments/export` | CSV, at most 5000 rows |

**`GET /ledgers` filters** (names are a contract with the dashboard links, e.g. `/accounts/pending?overdue=true`):
`state` (`AWAITING_FINALIZATION, UNPAID, PARTIAL, PAID`, comma separated), `q` (client, email, phone), `overdue=true`,
`finalized=true|false`, `has_balance=true`, `aging=0-30|31-60|61-90|90+` (URL-encode the plus: `90%2B`),
`created_from`, `created_to`, `ordering` (`-created_at` default, `client`, `-outstanding`, `outstanding`, `-total`,
`total`, `-received`, `-days_since` = waiting longest, `-last_payment_on`).

**`GET /payments` filters**: `ledger`, `mode` (comma separated), `q` (client, reference, note), `date_from`, `date_to`,
`has_proof`, `state` (`active`, `void`), `ordering` (`-received_on` default, `received_on`, `-amount`, `amount`).

**Rules** (all in `apps/accounts/rules.py`): payments need a finalized ledger; amount above zero, at most 10 digits and
2 decimals (floats refused); modes `CASH BANK_TRANSFER UPI CHEQUE CARD OTHER`, a reference for every mode but cash;
`received_on` a business-timezone date, not in the future and at most 90 days back; overpayment is blocked with no
override; an identical payment within 60 seconds needs `confirm_duplicate=true`; proof is optional (JPG, PNG, WebP or
PDF up to 5 MB, checked by its bytes, images re-encoded and stripped of EXIF); receipt number `RC-<year>-<id, 6 digits>`.
Overdue means finalized, a balance left and more than 30 days since the last active payment (else the finalization
date), counted in business-timezone dates.

**Error codes:** `already_finalized` 409, `not_finalized` 409, `total_below_received` 400, `total_below_budget` 400,
`overpayment` 409 (`details.outstanding`), `duplicate_payment` 409, `payment_void` 409, `invalid_phone` 400,
`invalid_proof` 400, `validation_error` 400 (`details.<field>`).

**Notifications** (through `core.services.notify`): `payment_received`, `payment_voided` (the other active admins),
`deal_finalized` (the lead's exec; payload is only `{lead_id, lead_name}`), `payment_overdue` (every admin, from
`python manage.py notify_overdue_payments`, once per ledger until a new payment resets `overdue_notified_at`).

### Adapter functions (called by Leads and Projects)

Implemented in `apps/accounts/services.py` with exactly the signatures the callers use:

| Function | Caller | Behaviour |
| --- | --- | --- |
| `create_ledger(lead)` | `leads.integrations.create_ledger`, inside the Won transaction | `get_or_create`; total = the lead's proposed amount (0 if none); unfinalized |
| `finalize_ledger(lead, amount, by)` | `leads.integrations.finalize` | Admin only; validates the amount; 409 `already_finalized` the second time. The leads note is not passed through (the caller sends three arguments) |
| `get_project_finance(lead)` | `projects.integrations` | `{total_amount, received, outstanding, finalized}` (Decimals), or `None` without a ledger. Its existence is the finalization marker Projects checks |
| `cancel_ledger(lead)` | `leads.integrations.cancel_ledger` on Won to Lost | Deletes the ledger when it has no payments (Leads already refuses when payments exist) |
| `Ledger.lead` (1:1), `total_amount`, `finalized_at` | `leads.integrations._ledger_model()` | The marker fields Leads looks for |

### What Dev C can import from accounts (Reports)

`apps.accounts.selectors`: `with_figures(qs)` (annotates `received`, `outstanding`, `last_payment_on`, `aging_base`),
`overdue_q()`, `aging_q(bucket)`, `aging_buckets(rows)`, `collection_rate(total, received)`, `ledger_state(...)`,
`summary(qs)` (the exact numbers behind `/ledgers/summary`), `PAYMENT_OVERDUE_DAYS`, `AGING_BUCKETS`, `now()` (patch
it in tests). The dashboard's Received, Outstanding, overdue and aging figures should come from `selectors.summary`
so they match Accounts exactly; `Payment.objects.filter(is_void=False)` is "money received".

## Projects and expenses (Dev B)

A PM sees only the projects assigned to them (anything else is **404**) and only the sanctioned budget. The Sales
roles get **403** on every endpoint here; anonymous requests get **401**. PM responses come from separate
serializers (allowlist) and never contain `total_amount`, `proposed_amount`, ledger, payment, `received`,
`outstanding`, margin or any lead field, not even as `null`. Money is a decimal string ("1234.50"), never a number.
Routes have no trailing slash, like the rest of the API.

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `GET /projects` | A, PM | Paginated (20). Filters and orderings below. PM: own projects, PM shape |
| ✅ | `GET /projects/summary` | A, PM | `{running, completed, ok, warn, over, no_pm (admin only), sanctioned_total, spent_total}`. Accepts the list filters except `state`; `status` picks which status the state counts are for (default running) |
| ✅ | `GET /projects/convertible` | A | Won deals that can become projects: `{count, results: [{lead, name, exec_name, won_at, proposed_amount, total_amount, suggested_budget, ineligible_reason, project_id}]}`. `?lead=<id>` looks one up and says why it cannot be converted: `not_won`, `project_exists` (with `project_id`) or `not_finalized` |
| ✅ | `GET /projects/managers` | A | Active project managers with `running_projects`, for the assign selects |
| ✅ | `POST /projects` | A | Convert a won lead. Body: `lead`, `name`, `sanctioned_budget`, `pm?` (null = assign later), `start_date?`, `expected_end_date?`, `scope?`. Returns the admin detail (201) |
| ✅ | `GET /projects/{id}` | A, PM | PM shape or admin shape (adds `pm`, `lead_id`, `finance`), plus `allowed_actions` computed by the server |
| ✅ | `PATCH /projects/{id}` | A | `name`, `start_date`, `expected_end_date`, `scope` |
| ✅ | `POST /projects/{id}/budget` | A | `{sanctioned_budget, reason}`. Never below what is spent, never above the deal total. Writes an event and notifies the PM |
| ✅ | `POST /projects/{id}/assign-pm` | A | `{pm}` (null unassigns). Notifies the old and the new PM |
| ✅ | `POST /projects/{id}/complete` | A, PM (own) | Locks expenses |
| ✅ | `POST /projects/{id}/reopen` | A | `{reason}`. Notifies the PM |
| ✅ | `GET /projects/{id}/events` | A, PM (own) | Append-only timeline, newest first, paginated |
| ✅ | `GET/POST /projects/{id}/expenses` | A, PM (own) | POST is `multipart/form-data`: `amount`, `category`, `spent_on`, `vendor?`, `description?`, `receipt?`, and for admins `admin_override`, `override_reason` |
| ✅ | `GET /expenses` | A, PM | Paginated. Filters below. PM: expenses on own projects only |
| ✅ | `GET /expenses/summary` | A, PM | `{total, count, void_count, by_category[]}` for the current filters; voided expenses are never counted |
| ✅ | `GET /expenses/alerts` | A | Running projects at or over 80%, worst first, with `pm_name`, `remaining`, `over_by` |
| ✅ | `GET /expenses/export` | A | CSV, at most 5000 rows, current filters. Cells starting with `= + - @` (or a tab) get an apostrophe prefix |
| ✅ | `GET /expenses/{id}` | A, PM (own) | `can_edit` says whether the caller may edit or void it now |
| ✅ | `PATCH /expenses/{id}` | A, PM (own, 30 min) | Same fields as POST (all optional). Re-checks the budget |
| ✅ | `POST /expenses/{id}/void` | A, PM (own, 30 min) | `{reason}`. The row stays visible with `is_void` and is excluded from every sum |
| ✅ | `GET /expenses/{id}/receipt` | A, PM (own) | The file, inline, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`. Receipts have no public URL: fetch with the JWT and show from a blob |

**`GET /projects` filters** (names are a contract with the dashboard links): `status` (`running`, `completed`, comma
separated), `pm` (id or `none`), `q` (name or client), `state` (`ok`, `warn`, `over`), `over_budget=true` (warn and
over), `near_limit=true` (warn only), `no_pm=true`, `created_from`, `created_to` (YYYY-MM-DD, business days),
`ordering` (`name`, `-usage_pct`, `-spent`, `-created_at`, `expected_end_date`; default `-created_at`), `page`,
`page_size`. Dashboard links: `/projects/running?over_budget=true` and `/projects/running?no_pm=true`.

**`GET /expenses` filters**: `project`, `category` (comma separated), `logged_by`, `q` (vendor, description, project),
`date_from`, `date_to`, `has_receipt` (`true`/`false`), `state` (`active`, `void`, `override`), `ordering`
(`-spent_on` default, `spent_on`, `-amount`, `amount`, `-created_at`).

**Budget state** (`selectors.budget_state(spent, sanctioned)`): `ok` below 80%, `warn` from 80% to 100% inclusive,
`over` above 100%. Every project carries `sanctioned_budget`, `spent`, `remaining` (negative when over),
`usage_pct` (a string such as `"82.50"`, cut, never rounded up) and `state`.

**Error codes** (standard `{error: {code, message, details}}`):

| Code | HTTP | When |
| --- | --- | --- |
| `not_won` | 400 | Converting a lead that is not Won |
| `project_exists` | 409 | The lead already has a project (`details.project_id`) |
| `not_finalized` | 409 | Accounts says the deal is not finalized (only once the accounts marker exists) |
| `budget_exceeds_total` | 400 | Sanctioned budget above the deal total (`details.max_budget`, admin only) |
| `budget_below_spent` | 400 | New budget below what is already spent (`details.spent`) |
| `over_budget` | 409 | The expense would pass the budget (`details.remaining`); an admin may retry with `admin_override` and a reason |
| `project_completed` | 409 | Any change to a completed project's expenses or budget |
| `not_completed` | 409 | Reopening a running project |
| `expense_void` | 409 | Changing an expense that is already void |
| `edit_window_closed` | 403 | A PM changing their own expense after 30 minutes |
| `invalid_receipt` | 400 | Wrong type (checked by magic bytes), over 5 MB or unreadable image |
| `validation_error` | 400 | Field errors in `details` (`amount`, `spent_on`, `receipt`, `pm`, `reason`, ...) |

Expense rules: amount is a positive decimal string, at most 10 digits and 2 decimals (floats are refused); `spent_on`
is a business-timezone date (`BUSINESS_TIME_ZONE`, default Asia/Kolkata), not in the future and at most 30 days back;
categories `MATERIALS LABOUR TRANSPORT EQUIPMENT FOOD PERMITS OTHER`; a receipt (JPG, PNG, WebP or PDF, 5 MB) is
required except for `LABOUR`. Images are re-encoded (EXIF removed, at most 1600 px). All numbers above live in
`apps/projects/rules.py`.

### Projects -> Accounts (what Dev C provides)

Projects reads the deal's money through one adapter, `apps/projects/integrations.py`. It needs:

* `accounts.services.get_project_finance(lead) -> {total_amount, received, outstanding, finalized} | None`
  (Decimals; `None` when the lead has no ledger). **Implemented by the accounts module** (see "Adapter functions"). Before it existed:
  * conversion was allowed without finalization, and the budget ceiling was the lead's `proposed_amount`;
  * the admin detail returned `finance: null`.
* The existence of that function is the "finalization marker": once it exists, `POST /projects` returns
  `409 not_finalized` unless `finalized` is true, and `/projects/convertible` lists only finalized deals.

### What Dev C can import from projects

* `apps.projects.selectors.budget_state(spent, sanctioned)` returns `"ok" | "warn" | "over"`, and
  `usage_pct(spent, sanctioned)` returns the string. Use them so every screen agrees on "near limit".
* `apps.projects.selectors.budget_usage_qs(qs=None)` annotates `Project` rows with `spent` (non-void expenses)
  and `usage`. Filter with `selectors.state_q("warn")` (also `"ok"`, `"over"`), for example the dashboard's "projects
  over budget" count: `budget_usage_qs().filter(status="RUNNING").exclude(state_q("ok"))`.
* `selectors.project_margins(finance, spent, sanctioned)` is the one definition of planned and live margin.
* Notification types sent through `core.services.notify`: `budget_warn`, `budget_over` (every active admin, once per
  upward change), `project_assigned`, `project_unassigned`, `budget_changed`, `project_completed`, `project_reopened`.
  Payloads carry `project_id` and `project_name` (alerts add `usage_pct`, `spent`, `sanctioned_budget`).

### PM dashboard (Dev B)

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `GET /dashboard/pm?period=month\|quarter\|year\|all` | PM | PM home (`apps/projects/dashboard_pm_views.py`). 401 anonymous, 403 every other role, 400 bad period |

Scoped to the caller's own projects. Budget figures come from the same `selectors` as the project detail page, so `state`, `usage_pct`, `spent` and `remaining` always match it. Never contains the deal total, payments, margins or lead data. `period` changes only `expenses_logged_period` / `expenses_amount_period` (non-void expenses dated in the period); the budget snapshot never depends on it. `projects` lists running first, then completed. `alerts` = running projects whose `state` is `warn` or `over`, over first, worst `usage_pct` first. `recent_expenses` = newest 8 on the PM's projects (voided ones included, flagged `is_void`). `recent_activity` = last 8 of project_assigned, budget_changed, expense_added, project_completed, project_reopened. Under 12 queries.

```json
{
  "as_of": "2026-09-25T09:30:00Z",
  "business_date": "2026-09-25",
  "period": {"key": "month", "from": "2026-09-01", "to": "2026-09-25"},
  "kpis": {
    "projects_running": 2, "projects_completed": 1,
    "total_sanctioned": "900000.00", "total_spent": "627500.00", "total_remaining": "272500.00",
    "expenses_logged_period": 4, "expenses_amount_period": "63500.00"
  },
  "projects": [
    {"id": 1, "name": "Riverside Court Renovation", "client_name": "Riverside Sports Club", "status": "RUNNING",
     "sanctioned_budget": "600000.00", "spent": "492000.00", "remaining": "108000.00",
     "usage_pct": "82.00", "state": "warn", "expected_end_date": "2026-10-25"}
  ],
  "alerts": [
    {"project_id": 1, "project_name": "Riverside Court Renovation", "state": "warn", "usage_pct": "82.00", "remaining": "108000.00"}
  ],
  "recent_expenses": [
    {"id": 11, "project_id": 1, "project_name": "Riverside Court Renovation", "category": "MATERIALS",
     "amount": "24000.00", "spent_on": "2026-09-25", "has_receipt": true, "is_void": false}
  ],
  "recent_activity": [
    {"at": "2026-09-25T09:25:00Z", "type": "project_completed", "project_id": 3,
     "project_name": "Kondhwa Cricket Nets", "text": "Project marked Completed"}
  ]
}
```

`usage_pct` has two decimals (the same string the project endpoints return, truncated never rounded up). `complete` notifies every admin plus the project's PM, except the person who completed it.

## Reports (Dev C)

All four take `?period=month|quarter|year|all|custom` (default `month`; `custom` needs `from` and `to`, `YYYY-MM-DD`, in the business time zone, Asia/Kolkata) and `?export=csv` for a file download (`text/csv`, attachment). Text cells that start with `=`, `+`, `-` or `@` are prefixed with `'`. Money is a string with 2 decimals. A module that is not merged yet gives zeros or empty lists, `data_sources` says which are connected, and `note` explains. Errors: 400 for a bad period, 403 for other roles.

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `GET /reports/sales` | A, SM | Per sales executive. Won and lost are decided in the period; commission = won value x the executive's rate. |
| ✅ | `GET /reports/financial` | A | Received vs expenses per month (6 months, 12 for year/all), aging, top 5 clients by outstanding, collection rate; all from accounts and expenses. |
| ✅ | `GET /reports/project-margin` | A | One row per project: budget, spent, usage, and (finalized ledgers only) total, received, planned and live margin. |
| ✅ | `GET /reports/lead-funnel` | A | Stages of leads created in the period, `reached` (this stage or later), conversion from the previous stage, lost, split by source. |

```json
// GET /reports/sales?period=all
{"period": "all", "range": {"start": null, "end": "2026-09-25"}, "data_sources": {"leads": true},
 "rows": [{"user_id": 2, "name": "Eva", "leads_worked": 4, "won": 2, "lost": 1, "conversion_pct": "66.7",
           "won_value": "1500.50", "commission_rate": "10.00", "commission": "150.05"}],
 "totals": {"leads_worked": 4, "won": 2, "lost": 1, "conversion_pct": "66.7", "won_value": "1500.50", "commission": "150.05"}}

// GET /reports/financial?period=year
{"period": "year", "range": {"start": "2026-04-01", "end": "2026-09-25"}, "data_sources": {"accounts": false, "expenses": false},
 "note": "Financial figures pending accounts integration.", "months": ["2025-10", "...", "2026-09"],
 "received": ["0.00"], "spent": ["0.00"],
 "totals": {"received": "0.00", "spent": "0.00", "net": "0.00", "outstanding": "0.00", "collection_rate_pct": "0.0"},
 "aging": [{"bucket": "0-30", "count": 0, "amount": "0.00"}], "top_outstanding_clients": [{"name": "Acme", "ledgers": 2, "outstanding": "5000.00"}]}

// GET /reports/project-margin
{"period": "month", "range": {"start": "2026-09-01", "end": "2026-09-25"}, "data_sources": {"projects": false, "accounts": false},
 "note": "Financial figures pending accounts integration.",
 "rows": [{"id": 1, "name": "Villa", "pm": "Pat", "sanctioned": "100000.00", "spent": "40000.00", "usage_pct": "40.0",
           "total": "150000.00", "received": "90000.00", "planned_margin": "50000.00", "live_margin": "50000.00"}]}

// GET /reports/lead-funnel?period=all
{"period": "all", "range": {"start": null, "end": "2026-09-25"}, "data_sources": {"leads": true},
 "stages": [{"status": "NEW", "label": "New", "count": 4, "value": "40.00", "reached": 8, "conversion_pct": null},
            {"status": "CONTACTED", "label": "Contacted", "count": 2, "value": "40.00", "reached": 4, "conversion_pct": "50.0"}],
 "lost": {"count": 1, "value": "5.00"},
 "sources": [{"source": "WEBSITE", "label": "Website", "leads": 6, "won": 1, "conversion_pct": "16.7", "value": "70.00"}]}
```

## Notifications (Dev C)

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `GET /notifications` | any | Own, newest first, paginated. `?is_read=`. Item: `{id, type, title, body, data, is_read, created_at}` |
| ✅ | `GET /notifications/unread-count` | any | `{count}` |
| ✅ | `POST /notifications/{id}/read` | any | Own only (404 otherwise) |
| ✅ | `POST /notifications/read-all` | any | `{updated}` |
| 🔲 | `/notifications/devices` | any | 501 `not_implemented` until push is built |

## Team and settings (Dev C)

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `GET /users`, `GET/PATCH /users/{id}` | A | `?q=&role=&is_active=`, paginated. Role changes and deactivation refuse your own account and the last active admin (400). |
| ✅ | `POST /users/{id}/deactivate`, `/reactivate` | A | Deactivating signs the user out at once. |
| ✅ | `POST /users/{id}/reset-password` | A | `{temporary_password, must_change_password}`, shown once, never stored in readable form. |
| ✅ | `PATCH /users/{id}/commission-rate` | A | `{commission_rate}` 0 to 100, 2 decimals; sales executives only. |
| ✅ | `GET /users/roles` | A | The four fixed roles and what each can do. |
| ✅ | `GET /users/assignments-overview` | A, SM | `{data_sources, execs: [{id, name, open_leads, overdue}], pms: [{id, name, running_projects, over_budget}]}` |
| ✅ | `GET /me`, `PATCH /me` | any | `{id, name, first_name, last_name, email, phone, role, must_change_password, commission_rate}`; commission only for executives. PATCH accepts `first_name`, `last_name`, `phone` only. |
| ✅ | `GET /core/master-data` | A | `{lists: [{key, label, source, owner_app, available, values: [{value, label}]}]}`, read from the code's choices. |
| ✅ | `GET /core/audit-log` | A | `?model_label=&actor=&action=CREATE|UPDATE|DELETE&from=&to=&q=`, paginated (20). Item: `{id, actor: {id, name}|null, action, model_label, object_id, object_repr, changes: {field: {old, new}}, created_at}`. Passwords are never recorded. |
| ✅ | `GET /core/audit-log/models` | A | Model labels that have entries. |

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

**Status:** live. Every figure is calculated from the database (leads, accounts, projects) using each app's own
selectors, so screens agree on what open, overdue, aging and over budget mean. `data_sources` says which apps are
present; a missing one leaves its part at zeros. Payments and expenses that are voided never count. The period
boundaries use the business time zone (Asia/Kolkata). The dev build no longer uses a fixture (`environment.useMocks`
is false; the fixture is only for UI review).
