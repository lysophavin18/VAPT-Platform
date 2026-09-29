---
description: "Use when: reviewing the NoovaStack VAPT project — full review, architecture, security, code quality, or specific changes. Usage: /review-project <focus> [paths]"
argument-hint: "Focus (full|architecture|security|quality|changes) and optional paths to scope the review"
agent: "agent"
---

You are reviewing the **NoovaStack VAPT Platform** — an AI-assisted Vulnerability Assessment and Penetration Testing platform with a FastAPI/Python backend, a Next.js/TypeScript frontend, and a Docker Compose deployment (PostgreSQL, Redis, NGINX).

# Task

Review the project according to the requested focus. The user provides:
1. **Focus** — one or more of: `full`, `architecture`, `security`, `quality`, `changes`.
2. **Scope** (optional) — specific files, directories, or a summary of the changes. If omitted, review the whole project.
3. Any specific questions or concerns.

# Process

1. If focus is `full` (or unspecified), treat all focus areas below as included.
2. Read the top-level docs first (`README.md`, `ARCHITECTURE.md`, `docker-compose.yml`) to ground the review in the intended design.
3. Direct your reading at the provided scope, or explore `backend/`, `frontend/`, `tests/`, and `configs/` for a whole-project review.
4. Back every finding with concrete evidence: cite file paths and line references.
5. For `changes`, review the selected files for correctness, regressions, and consistency with existing patterns — do not re-review the whole codebase.

# Focus areas

- **Architecture**: structure, data flow, separation of concerns, scan orchestration/scheduling, scalability, and consistency with the documented architecture.
- **Security**: authentication/authorization, scope and safety controls (this is a security tool — approve/execute scans only through platform policy), input validation, secrets handling, SQL injection, SSRF, and dependency risks.
- **Code quality**: maintainability, error handling, typing, tests, duplication, and adherence to existing conventions.
- **Completeness**: missing features, TODOs, stubs, and mismatches between frontend, backend API, and docs.

# Output format — actionable checklist

Return a Markdown checklist ordered by priority. Use this scheme:

- `[ ] **HIGH** — <issue> (<file>:<line>)` — must fix: security or correctness risk
- `[ ] **MEDIUM** — <issue> (<file>:<line>)` — should fix: maintainability or edge-case risk
- `[ ] **LOW** — <issue> (<file>:<line>)` — nice to have: style or minor

After the checklist, include:
- A 2–3 sentence overall verdict on the reviewed scope.
- A brief list of strengths (what is done well).

# Constraints

- Do not modify any files; this is a read-only review.
- Do not run scans or execute shell commands against the platform.
- Be specific and concise; avoid generic advice that does not apply to this codebase.
