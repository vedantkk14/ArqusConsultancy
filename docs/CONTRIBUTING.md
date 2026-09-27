# Contributing

Three developers work in parallel: **A** = leads, **B** = projects + expenses, **C** = accounts, notifications,
reports and platform. Each dev owns their app(s).

## Branches

- `main`: stable. `develop`: integration branch; **it must always run** (migrate, pytest, ng build).
- Feature branches: `feature/<dev>-<module>-<task>`, e.g. `feature/a-leads-crud`, `feature/c-accounts-ledger-model`.
- Branch off `develop`, merge back into `develop` by pull request.

## Pull requests

- Keep them **small** (one task, ideally under a day). Merge into `develop` **often**.
- **Pull/rebase `develop` before every PR**: `git fetch && git rebase origin/develop`.
- Before opening a PR, run: `pytest`, `ruff check .` (backend); `npm test`, `npm run lint`, `npm run build` (frontend).
- If you add or change an endpoint, update `docs/API_CONTRACT.md` in the same PR.
- Do not commit `.env`, `.venv`, `node_modules`, or `media/`.

## Backend conventions

- Stay inside your app. Talk to other apps through their `services.py`.
- Use **string FK references** to other apps' models: `models.ForeignKey("leads.Lead", on_delete=models.PROTECT)`.
  Never `from apps.leads.models import Lead` in another app's models.
- Logic goes in `services.py`; views and serializers stay thin.
- Money is `DecimalField(max_digits=12, decimal_places=2)`, never float (see ARCHITECTURE.md).
- Anything a PM can reach needs a case in `apps/projects/tests/test_pm_privacy.py`.
- Add your demo data to the matching TODO section of `seed_demo_data`.

## Migrations

- **Each dev owns their app's migrations.** Only run `makemigrations <your_app>`, and commit the result with the model change.
- Never edit a migration that is already on `develop`; add a new one.
- If two branches create migrations for the same app and Django reports conflicting leaf nodes:
  `python manage.py makemigrations --merge`, commit the merge migration, and re-run `migrate`.
- If a migration needs a model from another app, use `dependencies = [("leads", "0001_initial")]` and keep it as small as possible.

## Frontend conventions

- Add a page by editing `core/config/sidebar.config.ts`, then replace its placeholder in
  `features/<area>/<area>.routes.ts` with a real lazy-loaded route (same `path`, keep `canActivate: [roleGuard]`
  and the `data.roles`).
- Use `ApiService` for HTTP (never `HttpClient` directly in features); it handles the base URL and error shape.
- Keep it mobile-first: design for phone width first, then enlarge.
