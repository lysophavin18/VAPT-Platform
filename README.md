#  VAPT Repository

This repository contains the NoovaStack VAPT platform. The active application lives in `noovastack-vapt/`.

The old root-level VAPT stack has been removed. Do not use root-level `backend/`, `frontend/`, `database/`, `tools/`, or root Docker Compose files for the current platform.

## Run The Platform

```bash
cd noovastack-vapt
cp .env.example .env
docker compose up -d --build
```

Check services:

```bash
docker compose ps
```

Stop services:

```bash
docker compose down
```

## Access Points

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:8002` |
| API Docs | `http://localhost:8002/api/docs` |
| NGINX Proxy | `http://localhost:8082` |
| PostgreSQL | `localhost:5434` |
| Redis | `localhost:6381` |

Default local login:

| Field | Value |
| --- | --- |
| Email | `admin@noovastack.local` |
| Password | `AdminSecure2024!` |

Change default credentials before any non-local deployment.

## Repository Layout

```text
VAPT-Platform/
├── README.md                         Root repository entry point
├── .gitignore                        Ignore rules for secrets, builds, reports, caches
└── noovastack-vapt/                  Active NoovaStack VAPT platform
    ├── README.md                     Full platform documentation
    ├── ARCHITECTURE.md               Architecture and design notes
    ├── docker-compose.yml            Local service orchestration
    ├── .env.example                  App environment template
    ├── backend/                      FastAPI API, database, workers, reports, safety logic
    ├── frontend/                     Next.js UI
    ├── configs/                      NGINX configuration
    ├── sample-reports/               Example report outputs
    ├── tests/                        Backend test entry points
    └── workflows/local-ai-agent-program/
        ├── prompts/                  Agent system prompts
        ├── schemas/                  Structured output schemas
        ├── datasets/                 Training/evaluation examples
        ├── evals/                    Evaluation cases and plan
        ├── rag/                      RAG collection configuration
        ├── registry/                 Model registry template
        ├── agents.yaml               Agent registry
        ├── skill_routing.yaml        Tool and skill routing policy
        └── tool_catalog.yaml         Controlled tool catalog
```

## What The Platform Does

NoovaStack VAPT is an AI-assisted vulnerability assessment and penetration testing platform for authorized security testing.

Core capabilities:

- Project, engagement, asset, scan, finding, evidence, report, and audit-log management.
- Safety-controlled scan orchestration through FastAPI and Celery workers.
- Professional report generation in multiple formats.
- Local AI assistant integration through an OpenAI-compatible local model endpoint.
- Controlled AI tool-request workflow where the backend validates scope, authorization, module allowlists, risk, and approval requirements before execution.

## Important Safety Notes

- Only scan systems you own or are explicitly authorized to test.
- The AI assistant should plan and request tasks; it must not bypass backend safety controls or execute raw shell commands directly.
- Keep `.env` files, generated reports, caches, `.next/`, `node_modules/`, and `__pycache__/` out of Git.

## Development Workflow

Use the repository root for Git:

```bash
git status
git add <paths>
git commit -m "message"
git push origin main
```

Use `noovastack-vapt/` for app commands:

```bash
cd noovastack-vapt
docker compose up -d --build
```

## More Documentation

- `noovastack-vapt/README.md`
- `noovastack-vapt/ARCHITECTURE.md`
- `noovastack-vapt/workflows/local-ai-agent-program/README.md`
