# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

This repo has one active application: **`noovastack-vapt/`**. The old root-level `backend/`, `frontend/`, `database/`, `tools/`, and root Docker Compose files are legacy and removed/unused — do not resurrect or reference them.

All app work happens inside `noovastack-vapt/`. Use the repo root only for Git.

```text
VAPT-Platform/
└── noovastack-vapt/
    ├── backend/    FastAPI API, database, workers, reporting, safety logic
    ├── frontend/   Next.js UI
    ├── configs/    NGINX config
    ├── workflows/local-ai-agent-program/   AI agent prompts, schemas, tool catalog
    ├── docker-compose.yml
    └── .env.example
```

## Commands

All commands below assume `cd noovastack-vapt` first unless noted.

### Running the full stack (Docker)

```bash
cp .env.example .env      # first time only; fill SECRET_KEY and INITIAL_ADMIN_PASSWORD
docker compose up -d --build
docker compose ps
docker compose down
```

Rebuild specific services after code changes:

```bash
docker compose up -d --build backend frontend celery-worker celery-beat nginx
```

Logs:

```bash
docker compose logs -f backend
docker compose logs -f celery-worker
docker compose logs -f frontend
```

Service ports: frontend `:3000`, backend API `:8002` (docs at `/api/docs`), NGINX `:8082`, Postgres `:5434`, Redis `:6381`.

### Backend (local, outside Docker)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend tests use pytest with `TestClient` against the real app/db setup (see `tests/backend/conftest.py`). They require `INITIAL_ADMIN_PASSWORD` and a reachable Postgres (`DATABASE_URL`)/Redis, so run them against the Docker-provided database or an equivalent local one:

```bash
cd noovastack-vapt
INITIAL_ADMIN_PASSWORD=... DATABASE_URL=... pytest tests/backend
```

There is also a second, older test set in `backend/tests/` (`test_approval_lifecycle.py`, `test_authorization.py`, `test_autonomous_agent.py`, `test_professional_report.py`) — check which set is relevant before adding new backend tests.

Quick syntax smoke check (no dependencies needed):

```bash
python3 -m py_compile backend/main.py backend/api/routes/*.py backend/workers/*.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev              # dev server on :3000
npm run build             # production build
npm run lint
npm test                  # vitest unit tests
npm run test:watch
npm run test:e2e          # playwright e2e tests
```

To run a single test file: `npx vitest run tests/unit/<file>.test.tsx` or `npx playwright test tests/e2e/<file>.spec.ts`.

## Architecture

Layered client-server app: Next.js frontend → FastAPI backend → Postgres/Redis, with Celery workers for async scan execution and a local/OpenAI-compatible AI provider for the assistant. Full flow:

```text
Browser -> NGINX :8082 -> Next.js :3000
                        -> FastAPI :8002 -> PostgreSQL (projects, users, assets, scans, findings, evidence, reports, audit logs)
                                         -> Redis (broker, cache, Celery result backend)
                                         -> Celery worker (scan, discovery, reporting, scheduling queues)
                                         -> Celery beat (scheduled scan dispatch)
                                         -> Scanner tools (safe HTTP checks, Wapiti, service discovery, TLS checks, depx, ...)
                                         -> AI provider (OpenAI-compatible /chat/completions; ollama locally, deepseek by default in docker-compose)
```

### Backend (`backend/`)

Not strict MVC, but close: routes act as controllers, SQLAlchemy models are the domain model, Pydantic schemas are DTOs, and safety/reporting/scans/workers hold business logic.

- `main.py` — FastAPI app bootstrap: CORS, DB table init, seeds default scan profiles + admin account, registers routers.
- `api/routes/` — one module per resource (`auth.py`, `projects.py`, `engagements.py`, `assets.py`, `scans.py`, `findings.py`, `reports.py`, `ai_agents.py`, `administration.py`, `dashboard.py`, `approvals.py`, `scan_schedules.py`, `cve.py`). This is the controller layer — request validation via schemas, DB access, response shaping.
- `api/schemas/__init__.py` — Pydantic request/response schemas (DTOs).
- `database/models/__init__.py` — all SQLAlchemy models in one module.
- `database/` — async SQLAlchemy engine/session setup, migrations.
- `auth/` — JWT issuance/validation, password hashing, RBAC dependencies used by routes.
- `safety/` — scope, authorization, testing-window, and prohibited-action checks that gate scan validation/launch. This is the core control layer: scans must pass these checks before they can run.
- `scans/profiles/__init__.py` — default scan profile definitions (category × depth × mode → module set, risk level). Reference for adding/adjusting profiles.
- `scans/` — orchestrator, progress tracking, scheduler for scan execution.
- `tools/adapters/`, `tools/parsers/`, `tools/policies/` — currently empty placeholder packages; not yet wired up. The actual per-tool integration lives in `workers/tasks_scan.py` (see below) — check there first, don't assume these directories hold the logic.
- `scans/tools.py` — `SCANNER_TOOL_CATALOG`, the source of truth for all 23 integrated scanner tools (id, module name, category, `safe_default`); `MODULE_TO_TOOL`/`EXTERNAL_TOOL_MODULES` derived from it drive dispatch in `tasks_scan.py`.
- `workers/` — Celery tasks: `tasks_scan.py`, `tasks_discovery.py`, `tasks_reporting.py`, `tasks_scheduling.py`, `tasks_ai.py`, plus `celery_app.py` wiring queues (`asset_discovery`, `scan`, `reporting`, `scheduling`, `ai`). `tasks_scan.py` is where scanner tools are actually invoked: `_resolve_tool_binary` finds the binary, `_external_tool_command` builds its argv per tool id, `_run_limited_command` runs it as a subprocess with a timeout, and `_ingest_tool_findings` parses each tool's stdout into candidate findings (per-tool-id branches, never auto-verified). Adding a new scanner means adding an entry to `SCANNER_TOOL_CATALOG` plus branches in both `_external_tool_command` and `_ingest_tool_findings`. Intrusive tools (`dalfox`, `sqlmap`) additionally require `scan.config.enable_intrusive_tools = true` even if installed.
- `reporting/` — normalizes findings/evidence into professional report exports (HTML, JSON, PDF, DOCX, Markdown, evidence ZIP).
- `config.py` — pydantic-settings `Settings`; rejects known-insecure `SECRET_KEY`/admin-password values at startup.

Scan lifecycle through the code: `POST /api/scans` (routes/scans.py) → schema validation → Project/ScanProfile lookup → Scan + ScanModule + AuditLog + ScanSafetyState rows created → `POST /api/scans/{id}/validate` runs `safety/` checks → `POST /api/scans/{id}/launch` only proceeds if validation passed → Celery `tasks_scan.py` executes modules via `tools/adapters` → results normalized into findings/evidence → `reporting/` renders exports.

### Frontend (`frontend/`)

Next.js 14 App Router + React Query, MVVM-ish split:

- `app/` — routed pages/layouts, grouped as `(auth)` and `(platform)`.
- `components/` — shared UI (feature dirs: `ai-agents`, `auth`, `dashboard`, `layout`, `scans`, `shared`, `tables`, `ui`).
- `hooks/` — React Query hooks per resource (view-model layer: data fetching, mutations, derived UI state) — e.g. `use-auth.tsx`, `use-projects.ts`, `use-schedules.ts`.
- `lib/api-client.ts` — typed HTTP client wrapping all backend calls; `lib/permissions.ts` for RBAC-aware UI gating; `lib/constants.ts`, `lib/validation.ts` (Zod schemas), `lib/utils.ts`.
- `types/` — TypeScript contracts mirroring backend schemas.
- `tests/unit/` (Vitest + Testing Library) and `tests/e2e/` (Playwright).

Route handlers under `app/api/` (if any) aside, all real backend calls go through `lib/api-client.ts` — add new endpoints there rather than calling `fetch` directly from components/hooks.

### AI assistant (`workflows/local-ai-agent-program/`)

Config-driven agent program separate from runtime code: `agents.yaml` (agent registry), `prompts/` (system prompts, e.g. `shared_system_policy.md`, `pentest_agent.md`), `schemas/` (structured output schemas like `scan_task_request.json`), `tool_catalog.yaml` (controlled/allowlisted tools), `skill_routing.yaml`, `rag/rag_collections.yaml`, `evals/`. The assistant is expected to plan and request actions through the controlled backend API (`/api/ai-agents/*`) — it must not execute raw shell commands or bypass the `safety/` checks. Keep this invariant when touching AI-related routes, prompts, or worker tasks.

## Safety Model (must-preserve invariants)

This is a security-testing platform; the whole point is that scans cannot run without going through authorization/scope checks. When modifying scan creation, validation, launch, or AI tool-request handling, preserve:

- Assets must be approved and in-scope before a scan can target them.
- Engagements must be authorized and not expired; testing-window enforcement applies.
- Deep scans, custom scans, white-box mode, and high-risk profiles require approval gates.
- Prohibited actions (DoS, brute force, credential theft, malware, persistence, data exfiltration, unauthorized pivoting) must stay blocked, not just logged.
- All project/engagement/scan/approval actions must go through audit logging.
- Validate-then-launch is a hard sequence: `POST /api/scans/{id}/launch` should only be reachable after `POST /api/scans/{id}/validate` returns `valid: true`.

## Configuration Notes

- `SECRET_KEY` and `INITIAL_ADMIN_PASSWORD` are required; `config.py` actively rejects a known list of insecure default values at startup.
- `INITIAL_ADMIN_PASSWORD` reseeds/rotates the admin password on every startup where it's set non-empty — remove it from the environment after first run.
- AI provider is OpenAI-compatible and swappable via `AI_PROVIDER`/`AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY`; docker-compose defaults to `deepseek`, but local dev has been run against an `ollama`-hosted model too — don't assume a single provider when touching `ai_agents.py` or `tasks_ai.py`.
- `celery-worker` runs with `network_mode: host` in docker-compose (needed to reach local network scan targets in lab setups) while other services use the bridge network — keep this asymmetry in mind when changing worker networking or connection strings (worker uses `127.0.0.1`-based URLs, other services use container hostnames).
