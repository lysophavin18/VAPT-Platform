# NoovaStack VAPT Platform

NoovaStack VAPT is an AI-assisted Vulnerability Assessment and Penetration Testing platform for authorized security testing. It provides project and engagement management, asset approval, controlled scan orchestration, finding validation, evidence collection, professional report exports, and a local security assistant backed by an OpenAI-compatible local model endpoint.

The platform is designed for security teams, IT administrators, QA teams, developers, and technical managers who need repeatable, auditable, and safety-controlled security assessments.

## Product Scope

NoovaStack VAPT supports the end-to-end assessment lifecycle:

1. Create a project for the application, infrastructure, API, repository, or attack surface.
2. Create an engagement with assessment mode, testing window, and rules of engagement.
3. Register or discover assets.
4. Approve assets and mark them in scope.
5. Select a scan profile and scan depth.
6. Validate authorization, scope, safety controls, and approval requirements.
7. Launch scan execution through backend workers.
8. Collect tool output, observations, evidence, and normalized findings.
9. Review findings, status, severity, integrity, remediation, and retest state.
10. Export professional reports in HTML, JSON, PDF, DOCX, Markdown, and evidence ZIP formats.

The AI assistant is used for guidance, planning, finding review, remediation support, report drafting, and controlled task requests. The model should not directly execute raw shell commands or bypass platform policy.

## Current Access Points

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:8002` |
| API Docs | `http://localhost:8002/api/docs` |
| NGINX Proxy | `http://localhost:8082` |
| PostgreSQL | `localhost:5434` |
| Redis | `localhost:6381` |

Default local account:

| Field | Value |
| --- | --- |
| Email | `admin@noovastack.local` |
| Password | `AdminSecure2024!` |

Change all default credentials before any non-local deployment.

## Quick Start

```bash
cd noovastack-vapt
cp .env.example .env
docker compose up -d --build
```

Check service status:

```bash
docker compose ps
```

Rebuild after backend or frontend changes:

```bash
docker compose up -d --build backend frontend celery-worker celery-beat nginx
```

Stop the stack:

```bash
docker compose down
```

## Repository Structure

```text
noovastack-vapt/
├── backend/                         FastAPI API, database models, workers, reporting, safety controls
│   ├── api/routes/                   REST API route modules
│   ├── api/schemas/                  Pydantic request and response schemas
│   ├── auth/                         JWT auth, password hashing, RBAC dependencies
│   ├── database/                     SQLAlchemy async database setup and models
│   ├── reporting/                    Professional report normalization and renderers
│   ├── safety/                       Scope, approval, testing-window, and action safety checks
│   ├── scans/                        Scan profiles and scanner tool catalog
│   ├── workers/                      Celery scan, discovery, reporting, and scheduling tasks
│   ├── config.py                     Backend settings and AI provider configuration
│   ├── Dockerfile                    Backend and worker image definition
│   └── requirements.txt              Python dependencies
├── frontend/                         Next.js platform UI
│   ├── app/                          App Router pages and layouts
│   ├── components/                   Shared UI components
│   ├── hooks/                        React Query and platform hooks
│   ├── lib/                          API client, auth helpers, constants, permissions, utilities
│   ├── public/branding/              NoovaStack brand assets
│   ├── tests/e2e/                    Playwright end-to-end tests
│   ├── tests/unit/                   Vitest unit tests
│   ├── Dockerfile                    Frontend image definition
│   └── package.json                  Frontend dependencies and scripts
├── configs/                          NGINX reverse proxy configuration
├── sample-reports/                   Example professional report outputs
├── reports/                          Locally generated report exports
├── tests/                            Shared or legacy backend test entry points
├── workflows/local-ai-agent-program/ AI agent prompts, schemas, RAG configuration, tool catalog, training assets
├── docker-compose.yml                Local orchestration for platform services
├── .env.example                      Environment configuration template
└── README.md                         Project documentation
```

## High-Level Architecture

```text
User Browser
    |
    v
NGINX Reverse Proxy :8082
    |
    ├── Frontend: Next.js :3000
    |
    └── Backend API: FastAPI :8002
            |
            ├── PostgreSQL: projects, users, assets, scans, findings, evidence, reports, audit logs
            ├── Redis: broker, cache, Celery result backend
            ├── Celery Worker: scan execution, discovery, reporting, scheduling
            ├── Celery Beat: scheduled scan dispatch
            ├── Scanner Tools: safe HTTP checks, Wapiti, service discovery, TLS checks, optional external tools
            └── Local AI Provider: Ollama/OpenAI-compatible chat completions endpoint
```

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| UI and state | React Query, React Hook Form, Zod, Radix UI primitives, Recharts, Lucide icons |
| Backend API | FastAPI, Pydantic v2, Uvicorn |
| Database | PostgreSQL 16, SQLAlchemy 2 async, asyncpg |
| Queue and async jobs | Redis 7, Celery 5 |
| Authentication | JWT, passlib bcrypt, role-based access control |
| Reporting | ReportLab, WeasyPrint, Markdown, DOCX-compatible rendering, evidence ZIP export |
| AI integration | OpenAI-compatible chat completions API, Ollama-compatible local provider |
| Tests | Vitest, Testing Library, Playwright, pytest-compatible backend tests |
| Deployment | Docker Compose locally, recommended Kubernetes or managed containers for production |
| Reverse proxy | NGINX |

## Core Domain Model

| Entity | Purpose |
| --- | --- |
| User | Authenticated platform account with role-based access |
| Project | Security workspace for an application, system, network, repository, or business unit |
| Engagement | Authorized testing event with mode, dates, testing window, and rules of engagement |
| Asset | Target URL, domain, IP, repository, API, or service under review |
| Scan Profile | Predefined module set for category, depth, and assessment mode |
| Scan | Configured assessment run linked to project, engagement, assets, and modules |
| Scan Module | Individual worker-executed scan step such as HTTP probing or security header checks |
| Finding | Normalized vulnerability or observation with severity, evidence, remediation, and status |
| Evidence | Supporting artifacts generated by scans or linked to findings |
| Approval | Review gate for higher-risk scan launches or restricted actions |
| Audit Log | Trace of important user and system actions |

## Assessment Modes

| Mode | Description |
| --- | --- |
| Black box | External assessment with no privileged internal knowledge |
| Gray box | Assessment with limited context, credentials, API documentation, or user roles |
| White box | Assessment with source code, architecture, dependencies, and deeper access |

## Scan Categories and Profiles

Default profiles are defined in `backend/scans/profiles/__init__.py`.

| Profile ID | Category | Depth | Modes | Risk |
| --- | --- | --- | --- | --- |
| `quick_web_black_box` | Website | Quick | Black box | Low |
| `standard_web_black_box` | Website | Standard | Black box | Medium |
| `standard_web_gray_box` | Website | Standard | Gray box | Medium |
| `deep_web_gray_box` | Website | Deep | Gray box | High |
| `white_box_complete` | Combined VAPT | Deep | White box | High |
| `standard_api_black_box` | API security | Standard | Black box, gray box | Medium |
| `standard_network` | Network | Standard | Black box | Medium |
| `standard_repository` | Repository | Standard | White box | Low |
| `quick_attack_surface` | External attack surface | Quick | Black box | Low |

## Safety and Authorization Model

The platform is built around controlled testing. Scans should run only after the system confirms scope, authorization, and safety requirements.

Controls include:

- Asset approval and in-scope status checks.
- Engagement authorization checks.
- Engagement expiry checks.
- Testing-window enforcement.
- Prohibited action blocking for destructive behavior.
- Approval gates for deep scans, custom scans, white-box mode, and high-risk profiles.
- Emergency stop, pause, cancel, and kill endpoints for running scans.
- Audit logging for project, engagement, scan, and approval actions.

Prohibited actions include denial of service, brute force, credential theft, malware, persistence, data exfiltration, production data modification, and unauthorized pivoting.

## End-to-End Workflow

### 1. Project Creation

Create a project to group the target system and assessment records.

Example API path:

```text
POST /api/projects
```

### 2. Engagement Setup

Create an engagement with mode, start date, end date, testing window, and rules of engagement.

Example API paths:

```text
POST /api/projects/{project_id}/engagements
POST /api/engagements/{engagement_id}/authorize
```

### 3. Asset Registration and Approval

Register the target URL, domain, IP, repository, or API endpoint. Approve it only when it is authorized and within scope.

Example API paths:

```text
POST /api/projects/{project_id}/assets
POST /api/assets/{asset_id}/approve
```

### 4. Scan Creation

Create a scan using the selected profile, category, depth, and assets.

Example API path:

```text
POST /api/scans
```

Recommended safe black-box web scan configuration:

```json
{
  "assessment_mode": "black_box",
  "scan_category": "website",
  "scan_depth": "quick",
  "scan_profile_id": "quick_web_black_box",
  "config": {
    "safe_only": true,
    "advanced_options": []
  }
}
```

### 5. Validation and Launch

Validate before launch. Launch only when validation returns `valid: true`.

Example API paths:

```text
POST /api/scans/{scan_id}/validate
POST /api/scans/{scan_id}/launch
```

### 6. Monitoring

Monitor status, module execution, events, safety state, evidence, and findings.

Example API paths:

```text
GET /api/scans/{scan_id}
GET /api/scans/{scan_id}/progress
GET /api/scans/{scan_id}/modules
GET /api/scans/{scan_id}/events
GET /api/scans/{scan_id}/findings
```

### 7. Reporting

Export report artifacts after scan completion.

Example API paths:

```text
GET /api/reports/scan/{scan_id}/data
GET /api/reports/scan/{scan_id}/export?format=html
GET /api/reports/scan/{scan_id}/export?format=json
GET /api/reports/scan/{scan_id}/export?format=pdf
GET /api/reports/scan/{scan_id}/export?format=docx
GET /api/reports/scan/{scan_id}/export?format=markdown
GET /api/reports/scan/{scan_id}/export?format=evidence_zip
```

## AI Assistant

The `/ai-agents` workspace provides a local NoovaStack Security Assistant. It is intended to support security workflow decisions, not bypass platform policy.

Current local model configuration:

| Setting | Value |
| --- | --- |
| Provider | `ollama` |
| API style | OpenAI-compatible `/chat/completions` |
| Base URL | `http://192.168.220.204:11434/v1` |
| Model | `qwen3-coder:30b-64k` |
| Context window | 64K |
| Timeout | 240 seconds |
| Max output tokens | 4096 |
| Temperature | 0.2 |

AI-related routes:

```text
GET /api/ai-agents/local-model/health
POST /api/ai-agents/local-chat
```

Recommended AI behavior:

- Plan assessments and explain tradeoffs.
- Ask for missing authorization or scope details when required.
- Request platform actions through controlled APIs.
- Summarize scan results and remediation plans.
- Draft reports from stored findings and evidence.
- Avoid raw shell execution and direct scanner invocation.

Prompt example for a safe controlled scan:

```text
Create and run a safe authorized black-box web assessment for http://192.168.220.209:3000/.

Use the platform workflow only. Do not execute raw shell commands.

Scope is limited to host 192.168.220.209, port 3000, http, and same-host paths only.

Create or reuse the project, engagement, asset, and scan. Use assessment_mode black_box, scan_category website, scan_depth quick, scan_profile_id quick_web_black_box, and safe_only true.

Validate scope and authorization before launching. Launch only if validation.valid is true. Do not perform denial of service, brute force, credential theft, malware, persistence, pivoting, data exfiltration, or production data modification.

After completion, summarize IDs, validation status, modules, findings, severity counts, and report export paths.
```

## API Overview

| Area | Routes |
| --- | --- |
| Authentication | `/api/auth/login`, `/api/auth/me`, `/api/auth/refresh`, `/api/auth/logout` |
| Projects | `/api/projects` |
| Engagements | `/api/projects/{project_id}/engagements`, `/api/engagements/{engagement_id}/authorize` |
| Assets | `/api/projects/{project_id}/assets`, `/api/assets/{asset_id}/approve` |
| Scans | `/api/scans`, `/api/scans/{scan_id}/validate`, `/api/scans/{scan_id}/launch` |
| Findings | `/api/findings`, `/api/scans/{scan_id}/findings` |
| Reports | `/api/reports/scan/{scan_id}/data`, `/api/reports/scan/{scan_id}/export` |
| Dashboard | `/api/dashboard/stats`, `/api/dashboard/activity`, `/api/dashboard/metrics` |
| Admin | `/api/admin/users`, `/api/admin/scan-profiles`, `/api/admin/scanner-tools` |
| AI | `/api/ai-agents/local-model/health`, `/api/ai-agents/local-chat` |

Full OpenAPI documentation is available at `http://localhost:8002/api/docs`.

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Tests

Frontend unit tests:

```bash
cd frontend
npm test
```

Frontend end-to-end tests:

```bash
cd frontend
npm run test:e2e
```

Frontend production build:

```bash
cd frontend
npm run build
```

Backend syntax smoke check:

```bash
PYTHONPYCACHEPREFIX=/tmp/opencode/pycache python3 -m py_compile backend/main.py backend/api/routes/*.py backend/workers/*.py
```

## Configuration

Important environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy async PostgreSQL connection string |
| `REDIS_URL` | Redis cache/default connection string |
| `CELERY_BROKER_URL` | Celery broker Redis database |
| `CELERY_RESULT_BACKEND` | Celery result backend Redis database |
| `SECRET_KEY` | JWT signing secret |
| `JWT_ALGORITHM` | JWT signing algorithm |
| `JWT_EXPIRATION` | Access token lifetime in seconds |
| `AI_PROVIDER` | AI provider identifier, currently `ollama` |
| `AI_BASE_URL` | OpenAI-compatible local model API base URL |
| `AI_API_KEY` | API key or placeholder required by client |
| `AI_MODEL` | Local model name |
| `AI_TIMEOUT_SECONDS` | AI request timeout |
| `AI_MAX_OUTPUT_TOKENS` | AI response token limit |
| `AI_TEMPERATURE` | AI generation temperature |

## Production Deployment Recommendations

The included Docker Compose stack is suitable for local development and lab environments. For production, deploy with stronger isolation, secret management, observability, and network controls.

### Infrastructure

- Run frontend, backend, workers, scheduler, database, Redis, scanner jobs, and AI provider as separately managed services.
- Prefer Kubernetes, Nomad, ECS, or another orchestrator that supports health checks, rolling updates, secret mounts, resource limits, and network policies.
- Use managed PostgreSQL where possible for backups, patching, high availability, and point-in-time recovery.
- Use managed Redis or a hardened Redis deployment with TLS, authentication, persistence policy, and restricted network access.
- Store generated reports and evidence in durable object storage such as S3, MinIO, GCS, or Azure Blob instead of container-local volumes.
- Isolate scanner workers in a dedicated network segment with explicit egress controls.
- Separate production, staging, and testing environments.

### Security Hardening

- Replace all default passwords, Redis credentials, database credentials, and JWT secrets.
- Use a strong random `SECRET_KEY` from a secret manager.
- Put the application behind TLS with HSTS and secure cookies.
- Restrict API and admin access by VPN, identity-aware proxy, or private network when possible.
- Enable CORS only for trusted frontend origins.
- Enforce least-privilege roles for users and service accounts.
- Require MFA or SSO for production administrators.
- Store secrets in Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Doppler, SOPS, or sealed Kubernetes secrets.
- Disable direct public access to PostgreSQL, Redis, and worker ports.
- Use image scanning and dependency scanning in CI before release.
- Pin container image versions and rebuild images regularly for security patches.
- Run containers as non-root wherever possible.
- Use read-only filesystems for services that do not need writes.
- Apply CPU, memory, process, and network limits to scanner workers.
- Keep destructive tools disabled unless a formal approval workflow and isolated test environment exists.

### AI Deployment

- Host the local model inside a private network.
- Restrict AI model access to backend services only.
- Do not send secrets, credentials, or sensitive customer data to external LLM providers unless approved by policy and contract.
- Log AI requests carefully. Avoid storing sensitive prompts by default.
- Use prompt templates and structured schemas for assessment plans, finding judgment, remediation advice, and report drafts.
- Keep AI-generated decisions advisory unless explicitly approved by a human.
- Add model health checks and fallback behavior for AI downtime.

### Scanner Worker Isolation

- Run scan workers separately from the API service.
- Consider one worker pool per risk class: passive, standard, authenticated, deep, and research.
- Use per-scan containers or short-lived jobs for stronger isolation.
- Apply egress allowlists based on approved assets and engagement scope.
- Prevent scanners from reaching internal networks unless explicitly authorized.
- Store tool outputs as evidence with retention and access controls.
- Record module status, tool versions, start time, stop time, and errors for auditability.

### Data and Compliance

- Encrypt data at rest for PostgreSQL volumes, object storage, and backups.
- Encrypt traffic in transit between reverse proxy, API, database, Redis, workers, and AI provider.
- Define evidence and report retention policies.
- Classify exported reports as confidential by default.
- Implement tenant isolation before offering the platform as multi-tenant SaaS.
- Add audit log retention and tamper-resistant export for regulated environments.
- Add data deletion workflows for customer offboarding.

### Observability

- Centralize logs from NGINX, frontend, backend, workers, database, Redis, and scanner jobs.
- Track request latency, API error rates, queue depth, worker duration, scan failures, report generation failures, and AI model latency.
- Add dashboards for scan throughput, pending approvals, failed modules, high-severity findings, and report exports.
- Configure alerts for failed workers, Redis unavailability, database errors, expired certificates, high queue latency, and abnormal scanner traffic.
- Use OpenTelemetry or compatible tracing for backend and worker flows.

### Backup and Recovery

- Back up PostgreSQL with point-in-time recovery.
- Back up evidence and report object storage.
- Test restore procedures regularly.
- Document recovery time objective and recovery point objective.
- Keep infrastructure configuration in version control.

### CI/CD

- Run frontend unit tests, backend tests, type checks, linting, and production builds in CI.
- Run dependency vulnerability scans for Python and Node packages.
- Run container image scans.
- Publish immutable versioned images.
- Deploy through staging before production.
- Use database migrations instead of automatic schema changes for production releases.
- Gate production deployment on smoke tests and health checks.

## Recommended Production Architecture

```text
Internet
  |
  v
CDN / WAF / DDoS Protection
  |
  v
Load Balancer with TLS
  |
  v
Ingress / API Gateway
  |
  ├── Frontend Service
  ├── Backend API Service
  ├── Worker Pool: Passive and Safe Web Checks
  ├── Worker Pool: Standard Authenticated Checks
  ├── Worker Pool: Reporting Jobs
  ├── Scheduler Service
  └── Private AI Gateway
        |
        └── Local Model Runtime

Private Data Network
  ├── Managed PostgreSQL
  ├── Managed Redis
  ├── Object Storage for Reports and Evidence
  ├── Secret Manager
  └── Monitoring and Logging Stack
```

## Operational Runbook

Common local commands:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f celery-worker
docker compose logs -f frontend
docker compose restart backend celery-worker
docker compose up -d --build frontend backend
```

Health checks:

```text
GET http://localhost:8002/api/docs
GET http://localhost:8002/api/ai-agents/local-model/health
GET http://localhost:8082
```

If scans do not run:

- Confirm Redis is healthy.
- Confirm `celery-worker` is running.
- Confirm the scan has approved in-scope assets.
- Confirm the engagement is authorized.
- Confirm validation returns `valid: true`.
- Check module errors through `/api/scans/{scan_id}/modules`.
- Check worker logs for missing scanner tools.

## Known Local Deployment Notes

- The local Docker Compose file exposes PostgreSQL and Redis on host ports for development convenience. Do not expose these in production.
- `celery-worker` currently uses host networking to reach local network targets. This is useful for lab scans, but production should use explicit network policies and controlled egress.
- The default admin account is seeded automatically. Replace it or rotate credentials before non-local use.
- Some scan modules depend on optional external tools. If a tool is not installed in the worker image, the module may be skipped or return a tool-specific error.
- Generated local reports are stored under `reports/` when exported manually.

## Documentation and Workflow Assets

The AI workflow program lives under `workflows/local-ai-agent-program/`.

Important files include:

| File | Purpose |
| --- | --- |
| `agents.yaml` | Agent registry and prompt/schema mapping |
| `prompts/shared_system_policy.md` | Common policy instructions |
| `prompts/pentest_agent.md` | Controlled pentest agent prompt |
| `schemas/scan_task_request.json` | Structured scan task request schema |
| `tool_catalog.yaml` | Controlled scanner/tool catalog |
| `rag/rag_collections.yaml` | RAG collection configuration |
| `evals/evaluation_plan.yaml` | Evaluation plan for agent behavior |
| `phase2_lora_training_config.yaml` | Future LoRA training configuration |

## Security and Legal Notice

Use this platform only for systems you own or are explicitly authorized to test. Unauthorized scanning, exploitation, credential attacks, disruption, or access to third-party systems may be illegal.

NoovaStack VAPT is designed to support safe, auditable, authorized security work. Human review remains required for scope approval, high-risk testing, final finding acceptance, and production-impacting decisions.
