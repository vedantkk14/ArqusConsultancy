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

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| ✅ | `POST /auth/login` | public | Body `{username, password}` → `{access, refresh, user: {id, name, email, role}}` |
| ✅ | `POST /auth/refresh` | public | Body `{refresh}` → `{access}` |
| ✅ | `GET /me` | any | `{id, name, email, role}` |

## Leads (Dev A)

| Status | Method & path | Who | Notes |
| --- | --- | --- | --- |
| 🔲 | `GET /leads` | A, SM, SE | Filters: status, owner, overdue. SE sees own leads |
| 🔲 | `POST /leads` | A, SM, SE | |
| 🔲 | `GET/PATCH /leads/{id}` | A, SM, SE | |
| 🔲 | `POST /leads/{id}/follow-ups` | A, SM, SE | |
| 🔲 | `POST /leads/{id}/mark-won` | A, SM, SE | Calls `accounts.services.create_ledger(lead)` |
| 🔲 | `POST /leads/{id}/mark-lost` | A, SM, SE | Requires a reason |

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
| 🔲 | `GET /dashboard/admin` | A | KPIs for the admin dashboard |
