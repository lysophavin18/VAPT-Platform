# NoovaStack VAPT Architecture

This document explains the structure of the NoovaStack VAPT Platform and how its codebase maps to common software architecture patterns such as MVC and MVVM.

## Architecture Summary

NoovaStack VAPT is not a pure MVC or pure MVVM application. It is a layered full-stack platform with a modern frontend, REST API backend, database models, background workers, scanner modules, reporting services, and local AI integration.

Best description:

```text
Layered client-server architecture with an MVC-style backend and an MVVM-like React frontend.
```

More detailed description:

```text
NoovaStack VAPT uses a Next.js component-based frontend with React Query hooks, a FastAPI REST backend with SQLAlchemy domain models and Pydantic schemas, and Celery workers for asynchronous scan orchestration.
```

## High-Level System Flow

```text
User Browser
  |
  v
Next.js Frontend
  |
  v
FastAPI Backend API
  |
  |-- PostgreSQL database
  |-- Redis queue/cache
  |-- Celery scan workers
  |-- Reporting engine
  |-- Safety validation engine
  |-- Local AI assistant integration
```

## Main Layers

| Layer | Purpose | Main Location |
| --- | --- | --- |
| Presentation Layer | Pages, layouts, UI, user interaction | `frontend/app`, `frontend/components` |
| Frontend State/ViewModel Layer | Data fetching, mutations, UI state orchestration | `frontend/hooks` |
| Frontend API Client Layer | Typed HTTP calls to backend APIs | `frontend/lib/api-client.ts` |
| Frontend Type Layer | TypeScript data contracts | `frontend/types` |
| Backend API Layer | REST endpoints and request handling | `backend/api/routes` |
| Backend Schema/DTO Layer | Request and response validation | `backend/api/schemas` |
| Domain Model Layer | SQLAlchemy database entities | `backend/database/models` |
| Business Logic Layer | Safety, scanning, reporting, AI behavior | `backend/safety`, `backend/scans`, `backend/reporting`, selected route logic |
| Async Worker Layer | Long-running scans, discovery, reports, schedules | `backend/workers` |
| Persistence Layer | PostgreSQL and Redis | Docker services |
| Infrastructure Layer | Containers, proxy, service wiring | `docker-compose.yml`, `configs/nginx.conf` |

## Repository Structure

```text
noovastack-vapt/
├── backend/
│   ├── api/
│   │   ├── routes/          REST API route handlers
│   │   └── schemas/         Pydantic request/response schemas
│   ├── auth/                Authentication, JWT, RBAC dependencies
│   ├── database/            SQLAlchemy database setup and models
│   ├── reporting/           Report normalization and export rendering
│   ├── safety/              Scope, approval, and action safety checks
│   ├── scans/               Scan profiles and scanner tool catalog
│   ├── workers/             Celery background tasks
│   ├── config.py            Backend settings
│   └── main.py              FastAPI application bootstrap
├── frontend/
│   ├── app/                 Next.js App Router pages and layouts
│   ├── components/          Reusable UI components
│   ├── hooks/               React Query hooks and UI data orchestration
│   ├── lib/                 API client, helpers, constants, utilities
│   ├── public/branding/     NoovaStack brand assets
│   ├── tests/               Unit and end-to-end tests
│   └── types/               TypeScript interfaces and domain types
├── configs/                 NGINX reverse proxy config
├── workflows/               Local AI agent prompt/schema/training assets
├── sample-reports/          Example report artifacts
├── docker-compose.yml       Local service orchestration
├── README.md                Main project documentation
└── ARCHITECTURE.md          Architecture documentation
```

## Backend Architecture

The backend is closest to an MVC-style architecture, but it is not strict MVC.

### Backend MVC Mapping

| MVC Concept | Project Equivalent | Example |
| --- | --- | --- |
| Model | SQLAlchemy database models | `backend/database/models/__init__.py` |
| View | Not directly present in backend; frontend owns the UI | `frontend/app`, `frontend/components` |
| Controller | FastAPI route handlers | `backend/api/routes/scans.py` |
| DTO / Schema | Pydantic schemas | `backend/api/schemas/__init__.py` |
| Service / Business Logic | Safety, reporting, scans, workers | `backend/safety`, `backend/reporting`, `backend/workers` |

The backend route files act like controllers. They receive requests, validate input through schemas, query or update database models, and return API responses.

Example scan flow:

```text
POST /api/scans
  -> backend/api/routes/scans.py
  -> ScanCreate schema validation
  -> Project and ScanProfile database lookup
  -> Scan database record creation
  -> ScanModule records creation
  -> AuditLog and ScanSafetyState creation
  -> JSON response to frontend
```

## Backend Code Roles

### `backend/main.py`

Application entrypoint. It creates the FastAPI application, configures CORS, initializes database tables, seeds default scan profiles and the default admin account, and registers API routers.

### `backend/api/routes`

Contains API endpoint modules. These are the backend controller layer.

Examples:

| File | Responsibility |
| --- | --- |
| `auth.py` | Login, logout, token refresh, current user |
| `projects.py` | Project CRUD |
| `engagements.py` | Engagement creation, authorization, closure |
| `assets.py` | Asset creation, approval, rejection, discovery |
| `scans.py` | Scan creation, validation, launch, progress, modules, findings |
| `findings.py` | Finding review, verification, false-positive status |
| `reports.py` | Report data and exports |
| `ai_agents.py` | Local AI health and chat API |
| `administration.py` | Admin settings, users, scan profiles, scanner tools |

### `backend/api/schemas`

Contains Pydantic schemas. These define request and response shapes for the API.

Examples:

```text
ProjectCreate
EngagementCreate
AssetCreate
ScanCreate
ScanResponse
FindingResponse
ReportGenerateRequest
```

### `backend/database/models`

Contains SQLAlchemy ORM models. These are the domain and persistence models.

Important models:

```text
User
Project
Engagement
Asset
ScanProfile
Scan
ScanAsset
ScanModule
Finding
Evidence
Approval
AuditLog
ScanSafetyState
```

### `backend/safety`

Contains safety policy logic for scope validation, blocked actions, approval checks, and testing-window checks.

This layer protects the platform from unsafe actions such as:

- Denial-of-service testing
- Brute force
- Credential theft
- Malware
- Data exfiltration
- Destructive exploitation
- Unauthorized pivoting
- Production data modification

### `backend/workers`

Contains Celery tasks for long-running work.

Examples:

| File | Responsibility |
| --- | --- |
| `celery_app.py` | Celery configuration |
| `tasks_scan.py` | Scan execution and module processing |
| `tasks_discovery.py` | Asset discovery jobs |
| `tasks_reporting.py` | Report generation jobs |
| `tasks_scheduling.py` | Scheduled scan execution |

Workers make the platform asynchronous. API routes can create or launch work, while Celery executes scans in the background.

### `backend/scans`

Contains scanner configuration.

Important files:

```text
backend/scans/profiles/__init__.py
backend/scans/tools.py
```

Scan profiles define which modules are used for different assessment types.

Examples:

```text
quick_web_black_box
standard_web_black_box
standard_web_gray_box
deep_web_gray_box
white_box_complete
standard_api_black_box
standard_network
standard_repository
quick_attack_surface
```

### `backend/reporting`

Contains report rendering and normalization logic.

The platform can export reports as:

```text
HTML
JSON
PDF
DOCX
Markdown
Evidence ZIP
```

## Frontend Architecture

The frontend is closest to an MVVM-like architecture, but implemented using React and Next.js patterns instead of formal ViewModel classes.

### Frontend MVVM Mapping

| MVVM Concept | Project Equivalent | Example |
| --- | --- | --- |
| Model | Backend API data and TypeScript types | `frontend/types`, backend JSON responses |
| View | Pages and UI components | `frontend/app/**/page.tsx`, `frontend/components` |
| ViewModel | React hooks and React Query state | `frontend/hooks/use-scans.ts` |
| Data service | API client | `frontend/lib/api-client.ts` |

Example scan page flow:

```text
frontend/app/(platform)/scans/page.tsx
  -> calls useScans()
  -> useScans() calls api.scans()
  -> api.scans() fetches /api/scans
  -> FastAPI backend returns scans
  -> React Query stores the data
  -> page renders scan table/cards
```

## Frontend Code Roles

### `frontend/app`

Contains Next.js App Router pages and layouts.

Examples:

| Path | Purpose |
| --- | --- |
| `app/layout.tsx` | Root application layout |
| `app/(auth)/login/page.tsx` | Login page |
| `app/(platform)/layout.tsx` | Authenticated platform layout |
| `app/(platform)/dashboard/page.tsx` | Dashboard page |
| `app/(platform)/scans/page.tsx` | Scan listing/workbench page |
| `app/(platform)/scans/new/page.tsx` | New scan flow |
| `app/(platform)/scans/[scanId]/page.tsx` | Scan detail page |
| `app/(platform)/ai-agents/page.tsx` | Local AI assistant workspace |
| `app/(platform)/reports/page.tsx` | Reports page |

### `frontend/components`

Contains reusable UI components.

Examples:

```text
components/layout/application-shell.tsx
components/layout/sidebar-navigation.tsx
components/layout/top-navigation.tsx
components/scans/scan-management.tsx
components/scans/scan-progress.tsx
components/ai-agents/*
components/dashboard/*
components/ui/*
```

### `frontend/hooks`

Contains data hooks. These behave like ViewModels in an MVVM-style frontend.

Examples:

```text
useAuth
useProjects
useAssets
useEngagements
useScans
useScanProgress
useFindings
useReports
useAIAgents
```

### `frontend/lib/api-client.ts`

Central frontend API client. It defines functions for backend API calls.

Examples:

```text
api.login()
api.projects()
api.createProject()
api.scans()
api.createScan()
api.validateScan()
api.launchScan()
api.scanModules()
api.scanResults()
api.localAiChat()
```

### `frontend/types`

Contains TypeScript types used by the frontend.

These types mirror backend objects such as:

```text
Project
Engagement
Asset
Scan
ScanModule
Finding
Report
User
AI Agent
```

## Data Flow Example: Creating and Running a Scan

```text
User clicks New Scan
  |
  v
Next.js page collects form data
  |
  v
React hook calls api.createScan()
  |
  v
POST /api/scans
  |
  v
FastAPI route validates ScanCreate schema
  |
  v
Backend checks Project and ScanProfile
  |
  v
Backend creates Scan, ScanAsset, ScanModule, AuditLog, ScanSafetyState
  |
  v
Frontend calls api.validateScan()
  |
  v
Backend validates scope, asset approval, engagement authorization, approval requirements, prohibited actions
  |
  v
Frontend calls api.launchScan() if valid
  |
  v
Backend queues Celery run_scan task
  |
  v
Celery worker executes scan modules
  |
  v
Findings, evidence, module outputs, events, and scan progress are stored
  |
  v
Frontend polls scan progress/results
  |
  v
User reviews findings and exports report
```

## Data Flow Example: AI Assistant

```text
User sends prompt in /ai-agents
  |
  v
frontend/app/(platform)/ai-agents/page.tsx
  |
  v
api.localAiChat()
  |
  v
POST /api/ai-agents/local-chat
  |
  v
FastAPI route builds OpenAI-compatible chat request
  |
  v
Local Ollama/OpenAI-compatible model endpoint
  |
  v
Structured assistant response returns to frontend
```

The AI assistant is advisory and controlled. It should plan, explain, summarize, and request approved platform tasks. It should not execute raw shell commands or bypass platform policy.

## MVC vs MVVM Explanation

### MVC

MVC means Model, View, Controller.

In classic MVC:

```text
Model      -> Data and business rules
View       -> User interface
Controller -> Handles user input and coordinates model/view updates
```

NoovaStack backend has MVC-like parts:

```text
Model      -> SQLAlchemy models
Controller -> FastAPI route handlers
View       -> Not in backend; handled by frontend
```

Because the backend returns JSON APIs instead of HTML views, it is better described as an API controller architecture rather than classic MVC.

### MVVM

MVVM means Model, View, ViewModel.

In MVVM:

```text
Model     -> Data and domain objects
View      -> UI rendering
ViewModel -> State and behavior prepared for the view
```

NoovaStack frontend is MVVM-like:

```text
Model     -> Backend data and TypeScript types
View      -> Next.js pages and React components
ViewModel -> React hooks such as useScans, useProjects, useAuth
```

It is not strict MVVM because React does not require formal ViewModel classes. Hooks provide the same practical role.

## Current Architecture Strengths

- Clear separation between frontend and backend.
- API-first backend design.
- Strong domain models in SQLAlchemy.
- Request and response validation with Pydantic.
- Reusable frontend hooks for API data.
- Background workers for long-running scan tasks.
- Safety checks before scan launch.
- Evidence-based finding and report generation.
- Local AI integration separated behind backend API routes.
- Docker Compose makes local development reproducible.

## Current Architecture Limitations

- Some backend business logic lives directly inside route files.
- There is no dedicated `services/` layer yet.
- There is no dedicated repository/data-access abstraction layer.
- Some frontend pages contain both UI and page-specific logic.
- Generated files must be carefully ignored before committing.
- Production deployments need stronger secrets, isolation, observability, and storage controls.

## Recommended Future Backend Structure

For long-term maintainability, the backend can be refactored toward a cleaner service-oriented layered structure.

Recommended structure:

```text
backend/
├── api/
│   ├── routes/
│   └── schemas/
├── services/
│   ├── project_service.py
│   ├── engagement_service.py
│   ├── asset_service.py
│   ├── scan_service.py
│   ├── finding_service.py
│   ├── report_service.py
│   └── ai_service.py
├── repositories/
│   ├── project_repository.py
│   ├── scan_repository.py
│   └── finding_repository.py
├── database/
├── workers/
├── safety/
├── scans/
└── reporting/
```

Target flow:

```text
Route Controller
  -> Service
  -> Repository
  -> SQLAlchemy Model
```

Benefits:

- Thinner route files.
- Easier unit testing.
- Better reuse between API routes and Celery workers.
- Clearer business rules.
- Easier production maintenance.

## Recommended Future Frontend Structure

The frontend can stay with the current React/Next.js pattern, but page-specific logic can be separated more clearly.

Recommended structure:

```text
frontend/
├── app/
├── components/
├── features/
│   ├── scans/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── schemas/
│   │   └── utils/
│   ├── findings/
│   ├── reports/
│   └── ai-agents/
├── hooks/
├── lib/
└── types/
```

Benefits:

- Better feature ownership.
- Less large page files.
- Easier testing.
- Clear separation between global components and feature-specific components.

## Final Classification

The most accurate architecture label for NoovaStack VAPT is:

```text
Layered full-stack web application
```

More specific:

```text
Next.js component-based MVVM-like frontend + FastAPI MVC-style REST backend + Celery worker-based asynchronous execution layer.
```

Short explanation:

```text
Frontend pages and components render the UI, hooks act like ViewModels, the API client talks to FastAPI controllers, SQLAlchemy models persist domain data, and Celery workers execute long-running security scans in the background.
```
