# Developer Guide

## Architecture

The platform is a Next.js frontend backed by FastAPI, PostgreSQL, Redis, Celery workers, Celery Beat, scanner tools, and an optional OpenAI-compatible AI provider.

```text
Browser → NGINX → Next.js
              └→ FastAPI → PostgreSQL
                         → Redis → Celery workers → scanner tools
                               → Celery Beat
                         → AI provider
```

Primary source directories:

| Path | Responsibility |
| --- | --- |
| `frontend/app` | Next.js pages and layouts |
| `frontend/components` | Reusable interface components |
| `frontend/hooks` | React Query data access and UI hooks |
| `frontend/lib/api-client.ts` | Browser API client |
| `backend/api/routes` | FastAPI HTTP routes |
| `backend/api/schemas` | Request and response contracts |
| `backend/auth` | JWT authentication, role checks, project authorization |
| `backend/database/models` | SQLAlchemy domain models |
| `backend/workers` | Celery tasks and schedules |
| `backend/scans` | Profiles and scanner catalog |
| `backend/reporting` | Report generation and export |
| `workflows/local-ai-agent-program` | AI prompts, schemas, tools, and evaluation assets |

## Local setup

```bash
cp .env.example .env
openssl rand -hex 32
# Put the generated value in SECRET_KEY and set a strong initial admin password.
docker compose up -d --build
docker compose ps
```

Development endpoints:

| Service | Address |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:8002` |
| NGINX | `http://localhost:8082` |
| pgAdmin | `http://127.0.0.1:5050` |

The API documentation endpoints require an administrator bearer token.

## Run components outside Docker

Backend:

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Use service URLs that match where each process runs. A container resolves `postgres` and `redis`; a host process normally uses the host-bound ports.

## Authorization requirements for new code

Frontend visibility is usability, not authorization. Every backend read and mutation must enforce access independently.

For project resources:

- Call `get_project_or_404`, `get_asset_or_404`, `get_scan_or_404`, `get_finding_or_404`, or the appropriate scoped helper.
- For lists, join to `Project` and apply `project_access_clause(current_user)`.
- Validate that supplied child IDs belong to the same authorized project.
- Return `404` for inaccessible resources to avoid identifier enumeration.
- Reserve global access for `has_global_project_access(user)`, currently only `admin`.

Never accept a `project_id`, `asset_id`, `scan_id`, or `finding_id` and query it without applying the current user’s project boundary.

## Adding an API feature

1. Add or update a Pydantic schema in `backend/api/schemas`.
2. Implement the route in the appropriate module under `backend/api/routes`.
3. Require the minimum role and enforce project scope.
4. Validate state transitions and ownership server-side.
5. Create an audit log for important mutations.
6. Add tests for success, forbidden access, cross-project IDs, invalid state, and malformed input.
7. Add the typed method to `frontend/lib/api-client.ts`.
8. Add a React Query hook when caching or mutation invalidation is needed.
9. Update this wiki and OpenAPI examples.

## Background jobs

Long-running discovery, scans, reporting, monitoring, AI work, and CVE synchronization belong in Celery tasks. API routes should validate and enqueue work, then return a durable identifier.

When adding a task:

- Select the correct queue.
- Make retries idempotent.
- Store state transitions before and after execution.
- Record sanitized failures without credentials.
- Enforce target scope again inside the worker.
- Define timeout, cancellation, and cleanup behavior.

## Database changes

SQLAlchemy models are in `backend/database/models/__init__.py`. Alembic is installed, but a complete production migration workflow is not established in this repository. Do not rely on automatic table creation for production schema evolution.

For every schema change, create and review a migration, test it against a restored production-sized copy, document rollback or roll-forward, and include backup prerequisites.

## Tests

```bash
cd frontend
npm test
npm run build
npx playwright test
```

Backend:

```bash
pytest backend/tests tests/backend
```

Security-sensitive tests should cover IDOR, role boundaries, self-approval, expired approvals, asset-project mismatch, scope changes between request and approval, and prohibited scan configurations.

## Definition of done

- Behavior is authorized server-side.
- Tests cover success and denial paths.
- No secrets or customer targets appear in code, logs, fixtures, or screenshots.
- Errors are actionable but do not reveal inaccessible resources.
- Background work is observable and recoverable.
- Documentation and API examples are updated.
- Production configuration remains separate from local defaults.
