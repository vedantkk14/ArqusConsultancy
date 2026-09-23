# CRM + Project Management

One system for the whole deal flow:

**Lead → Won Deal → Project → Payments & Expenses → Margin**

Roles: `ADMIN`, `SALES_MANAGER`, `SALES_EXEC`, `PROJECT_MANAGER`.
Core rule (the *privacy shield*): the Total Project Amount lives only in the accounts Ledger and is
never visible to a Project Manager, who sees only the Sanctioned Budget on their own projects.

- **Backend:** Python, Django 5.2 LTS, Django REST Framework, JWT auth, MySQL 8 (`backend/`)
- **Frontend:** Angular (standalone, SCSS) + Angular Material, mobile-first (`frontend/`)
- The API is stateless and versioned (`/api/v1/`) so the web app can later be wrapped as a mobile app.

## Prerequisites

- Python 3.11+ (3.12 recommended)
- Node.js 20+ and npm
- Git
- MySQL 8 running locally, with an empty database `crm_pm` (utf8mb4):
  `CREATE DATABASE crm_pm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

## Quick start

From the repo root, copy the env file and fill in your MySQL password and a secret key:

```bash
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

### Backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

| OS | Command |
| --- | --- |
| Windows (PowerShell) | `.venv\Scripts\Activate.ps1` |
| Windows (cmd) | `.venv\Scripts\activate.bat` |
| macOS / Linux | `source .venv/bin/activate` |

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo_data
python manage.py runserver
```

API docs: <http://localhost:8000/api/docs/> · Health: <http://localhost:8000/api/v1/health>

Tests and lint (from `backend/`, venv active):

```bash
pytest
ruff check .
```

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm start          # http://localhost:4200, forwards /api to http://localhost:8000
```

Other commands: `npm run build`, `npm test`, `npm run lint` (`ng lint`).

## Demo logins (dev only)

Created by `seed_demo_data`, which refuses to run when `DEBUG=False`.

| Role | Username | Password | Lands on |
| --- | --- | --- | --- |
| Admin | `admin` | `Admin@123` | `/dashboard` |
| Sales Manager | `sales_manager` | `Manager@123` | `/dashboard` |
| Sales Executive | `sales_exec` | `Exec@123` | `/leads/all` |
| Project Manager | `project_manager` | `Project@123` | `/projects/running` |

## Project structure

```
crm-pm-system/
├── backend/
│   ├── manage.py, requirements.txt, pytest.ini, pyproject.toml (ruff)
│   ├── config/            settings.py (all config from .env), urls.py, wsgi/asgi
│   └── apps/
│       ├── core/          abstract models, permissions, pagination, errors, notify(), seed command
│       ├── users/         custom User + roles, auth endpoints
│       ├── leads/         Sales module            (Dev A)
│       ├── projects/      Projects + Expenses     (Dev B)
│       ├── accounts/      Ledger + Payments       (Dev C)
│       ├── notifications/ Notifications           (Dev C)
│       └── reports/       Reports + dashboards    (Dev C)
├── frontend/
│   └── src/app/
│       ├── core/          auth (service, interceptor, guards), api, config (sidebar), models
│       ├── layout/        shell, topbar, responsive sidebar
│       ├── shared/        status-chip, empty-state, confirm-dialog, coming-soon page
│       └── features/      auth, dashboard, leads, projects, accounts, expenses,
│                          reports, team, communication, settings
├── docs/                  ARCHITECTURE, API_CONTRACT, CONTRIBUTING, OPEN_DECISIONS
├── .env.example
└── README.md
```

## Docs

- [Architecture](docs/ARCHITECTURE.md): modules, privacy shield, API rules, money rule
- [API contract](docs/API_CONTRACT.md): v1 endpoints, implemented vs planned
- [Contributing](docs/CONTRIBUTING.md): branches, PRs, migrations
- [Open decisions](docs/OPEN_DECISIONS.md): business rules to confirm, with recommended defaults
