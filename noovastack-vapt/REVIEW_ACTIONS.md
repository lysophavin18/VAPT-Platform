# 🔍 NoovaStack VAPT — Project Review & Action Items

> **Review date:** 2026-08-11
> **Scope:** Full project review (architecture, security, code quality, completeness) — backend, frontend, infrastructure
> **Method:** Read-only review verified against source; every item cites `file:line`
>
> Tick items as you fix them. Priority order suggested at the bottom.

---

## ✅ HIGH — Must fix (security / correctness risk)

### Authentication & access control
- [x] **HIGH** — `SECRET_KEY` falls back to a known default `change-me-in-production-please!!`; if `.env` is missing, every JWT is forgeable.
  - **Fix:** Load from env only and **fail fast** (raise) if key is still the default.
  - Location: `backend/config.py:27`
- [x] **HIGH** — Seeded admin password `AdminSecure2024!` is hardcoded and never rotated; it's also **pre-filled in the login form**, exposing it in the client bundle.
  - **Fix:** Generate/require a random admin password at seed time; remove the `defaultValues` pre-fill in the login form.
  - Location: `backend/main.py:68-69`, `frontend/app/(auth)/login/page.tsx:20`
- [x] **HIGH** — Refresh tokens are accepted as **access tokens**: `get_current_user` never checks the JWT `type` claim.
  - **Fix:** Reject tokens where `payload.get("type") != "access"`.
  - Location: `backend/auth/__init__.py:47-66`
- [x] **HIGH** — **Unauthenticated report access**: `/reports/scan/{id}/data` and the export endpoints have no auth dependency.
  - **Fix:** Add `current_user: User = Depends(require_user)` + scan ownership check to both.
  - Location: `backend/api/routes/reports.py:63, ~282`
- [x] **HIGH** — CORS `allow_origins=["*"]` **with** `allow_credentials=True` disables same-origin protection.
  - **Fix:** Pin allowed origins (from settings); never combine `*` with credentials.
  - Location: `backend/main.py:91-93`
- [x] **HIGH** — Global exception handler returns `str(exc)`, leaking internal errors/SQL/file paths.
  - **Fix:** Return a generic message; log the real error server-side.
  - Location: `backend/main.py:137-139`
- [x] **HIGH** — **IDOR**: `list_findings` returns findings across all projects; `get_project`, `get_engagement`, `get_asset`, `get_scan` + sub-resources, and dashboard stats/activity have no ownership checks.
  - **Fix:** Build an ownership-check helper (`user owns project?`) and apply to every get-by-ID route; scope dashboard stats to the user's projects.
  - Location: `backend/api/routes/findings.py:17-33`, `projects.py:73-90`, `engagements.py:26-95`, `assets.py:25-130`, `scans.py:127-138`, `dashboard.py:211-280`

### Scan safety gate bypasses (critical for a pentest tool)
- [x] **HIGH** — `start_scan` only checks `status in ("draft","approved")` and **skips** validation; non-approved/out-of-scope assets can be launched.
  - **Fix:** Call the same validation (`validate_scan`/`_validate_scan_ready`) used by `/launch`.
  - Location: `backend/api/routes/scans.py:203-240`
- [x] **HIGH** — `safe_only` (user-controlled scan config) is copied to `authorized_internal`, **bypassing the internal-network block**.
  - **Fix:** Remove `safe_only → authorized_internal` mapping; derive authorization from server-side approval/scope only.
  - Location: `backend/workers/tasks_scan.py:61`
- [x] **HIGH** — Asset discovery performs **no scope/safety validation** and forwards arbitrary targets to server-side HTTP probes with `verify=False` (SSRF).
  - **Fix:** Run discovery through `validate_scope`; drop `verify=False` or pin a trust store.
  - Location: `backend/workers/tasks_discovery.py:13-90`, `backend/api/routes/assets.py:132-153`
- [x] **HIGH** — Scheduled scans are dispatched **without the approval gate** and force `safe_only=True`.
  - **Fix:** Enforce the same readiness/approval validation before dispatch.
  - Location: `backend/workers/tasks_scheduling.py:30-110`
- [x] **HIGH** — `blocked_prefixes` misses `172.19-31.0.0/16`, `169.254.x`, `0.0.0.0`, `::1`, `fc00::/7`.
  - **Fix:** Use a proper IP-network set (incl. IPv6, link-local, private ranges).
  - Location: `backend/safety/__init__.py:56`
- [x] **HIGH** — Every tool finding is auto-marked `verified`/`confirmed`, contradicting the human-review workflow.
  - **Fix:** Default new findings to `unverified`/`candidate`; only human action promotes them.
  - Location: `backend/workers/tasks_scan.py:811-812`
- [x] **HIGH** — **Fabricated demo findings** attributed to real tools are inserted into reports for non-safe scans (false positives reaching customers).
  - **Fix:** Remove `_generate_sample_findings` entirely.
  - Location: `backend/workers/tasks_scan.py:127, 829+`

### Frontend
- [x] **HIGH** — AI-agents API **silently falls back to mock data on any API error** — including the kill switch, which can report "activated" when the backend call failed.
  - **Fix:** Remove mock fallbacks in production; surface real errors to the user instead.
  - Location: `frontend/api/ai-agents.ts:21-30`
- [x] **HIGH** — Auth token is read from `localStorage` (XSS-exfiltratable) and never validated server-side on load; unguarded `JSON.parse` of stored user.
  - **Fix:** Use `sessionStorage` only (or httpOnly cookies); wrap `JSON.parse` in try/catch; validate token with `/auth/me` on load.
  - Location: `frontend/lib/api-client.ts:44`, `frontend/hooks/use-auth.tsx:25-35`

### CVE intelligence freshness and correlation

- [x] **HIGH** — Repair the daily CVE sync failure caused by writing `"system"` into the UUID `AuditLog.actor_id` column.
  - Use `actor_id=None` for scheduled work and store `triggered_by: "system"` in audit details.
  - Roll back the failed SQLAlchemy transaction before attempting to persist failure state.
  - Ensure every exit path changes `cve_sync_state.status` from `running` to `success` or `failed`.
  - Location: `backend/workers/tasks_cve.py:28-76`, `backend/database/models/__init__.py:494-505`
- [x] **HIGH** — Recover the stale production CVE database after deploying the sync repair.
  - Reset the stale `nvd` state, run a paginated 30-day recovery import, and verify `CVE-2026-98432` is stored. Use bounded older backfill windows when historical coverage is required.
  - Record inserted, updated, rejected, and failed counts without deleting existing CVE records.
  - Acceptance: latest local publication/modification timestamps agree with NVD and the last-success age is below four hours.
- [x] **HIGH** — Replace the fixed publication-only window with a durable NVD modification cursor.
  - Query `lastModStartDate`/`lastModEndDate` with a small overlap so new CVEs and later record changes are both captured.
  - Advance the cursor only after all pages commit successfully; retain it after partial or failed runs.
  - Paginate using `startIndex`, `resultsPerPage`, and `totalResults`; never silently truncate at 500 or 2,000 records.
  - Location: `backend/workers/tasks_cve.py:45-68`
- [x] **HIGH** — Make CVE synchronization resilient and observable.
  - Run NVD modified-record synchronization every two hours.
  - Add optional `NVD_API_KEY`, retry HTTP 429/5xx responses with bounded exponential backoff, and enforce request/task timeouts.
  - Prevent concurrent runs with a database advisory lock or Redis lock and recover abandoned `running` states.
  - Persist Celery job ID, trigger type, page progress, record counts, timestamps, and a sanitized error code/message.
  - Alert when the last successful synchronization is older than four hours.
  - Location: `backend/workers/celery_app.py:68-77`, `backend/config.py`, `backend/workers/tasks_cve.py`
- [x] **HIGH** — Decouple CISA KEV synchronization from NVD synchronization.
  - Run KEV as an independent task so an NVD failure cannot block it.
  - Create placeholder local records for KEV CVE IDs not yet present instead of enriching only existing records.
  - Persist KEV fields in structured columns or a dedicated table rather than only inside raw JSON.
  - Location: `backend/workers/tasks_cve.py:79-124`
- [x] **HIGH** — Replace keyword-only CVE correlation with product and version-aware matching.
  - Normalize scan inventories to CPE for platforms/products and PURL for packages.
  - Evaluate affected and fixed version ranges for Linux distributions, kernels, containers, and application dependencies.
  - Use confidence states such as `possible`, `version_match`, and `confirmed`; never treat an alias or keyword match as proof of exposure.
  - Preserve source advisory, matched component/version, fixed version, and matching evidence with each finding.
  - Location: `backend/workers/tasks_scan.py:796-848`

---

## 🟠 MEDIUM — Should fix (maintainability / edge cases)

- [x] **MEDIUM** — No **object-level authorization layer**; ownership checks are ad-hoc and missing on most get/update-by-ID routes (root cause of IDORs).
  - Location: `backend/api/routes/*`
- [x] **MEDIUM** — `approvals.py` never checks `approval.expires_at`; `more_information` decision wrongly sets scan to `blocked`.
  - Location: `backend/api/routes/approvals.py:34-75`
- [x] **MEDIUM** — Approval is sticky (`approved_by is not None`) for the life of the scan record.
  - Location: `backend/workers/tasks_scan.py:65`
- [x] **MEDIUM** — CVE synchronization was moved out of the API request path into a Celery task and now returns a job ID.
  - Location: `backend/api/routes/cve.py:35-48`, `backend/workers/tasks_cve.py:16-76`
- [x] **MEDIUM** — Correct the manual-sync UI contract and expose durable job progress.
  - Treat `POST /api/cve/sync` as queued work; display the returned job ID and poll status until success or failure.
  - Do not display `records_synced` from the initial queued response.
  - Add `GET /api/cve/jobs/{job_id}` or include active-job progress in `/api/cve/status`.
  - Location: `frontend/lib/api-client.ts:331-332`, `frontend/app/(platform)/administration/page.tsx:173-182`
- [x] **MEDIUM** — Add an administrator-only targeted CVE refresh for urgent advisories.
  - Support importing one validated CVE ID, such as `CVE-2026-98432`, from the authoritative source without waiting for the periodic job.
  - Audit the request and apply the same upsert, retry, and validation rules as scheduled synchronization.
  - Location: `backend/api/routes/cve.py`, `backend/workers/tasks_cve.py`
- [ ] **MEDIUM** — Add advisory-source ingestion and alias mapping for breaking vulnerability names.
  - Store vendor advisories and aliases such as marketing/community names separately from authoritative CVE records.
  - Consider CVE.org, OSV, GitHub Security Advisories, Linux/vendor security feeds, and CISA KEV with source attribution and deduplication.
  - Never create a confirmed asset finding from news text alone.
- [ ] **MEDIUM** — `local_chat` has **no rate limiting / per-user quota** and minimal prompt-injection guardrails.
  - Location: `backend/api/routes/ai_agents.py:177-250`
- [x] **MEDIUM** — Untyped `dict` request bodies bypass schema validation.
  - Location: `backend/api/routes/scans.py:140-155, 270`, `backend/api/routes/scan_schedules.py:76-90`
- [ ] **MEDIUM** — **No DB migrations**: `database/migrations/versions/` is empty; schema evolves via `create_all` + a one-column `ALTER TABLE` hack.
  - **Fix:** Introduce Alembic.
  - Location: `backend/main.py:30-32`
- [x] **MEDIUM** — AI agent "control plane" is **in-memory mock lists** on both sides; pause/resume/kill-switch/evidence don't persist or enforce anything.
  - **Done:** agents, runs, tasks, activities, and recommendations are now persistent (`AIAgent`, `AIAgentRun`, `AIAgentTask`, `AIAgentActivity`, `AIAgentRecommendation`). A Qwen autonomous worker plans bounded authorized actions and executes them through the controlled tool-request/scan gate. Stop/kill actually revoke Celery tasks. The safety/evidence/messages UI panels remain cosmetic mocks.
  - Location: `backend/api/routes/ai_agents.py:72-110, 434-568`, `frontend/mocks/ai-agents.ts`
- [ ] **MEDIUM** — `generate_report` Celery task is a **pure stub**; retest creation returns success without creating anything.
  - Location: `backend/workers/tasks_reporting.py:13-28`, `backend/api/routes/scans.py:471-481`
- [ ] **MEDIUM** — Empty/unimplemented subsystems: `tools/adapters`, `tools/parsers`, `tools/policies`, `scans/orchestrator`, `scans/progress`, `scans/scheduler`, `ai/`, `findings/`, `evidence/`, `projects/`, `results/`. Orchestrator logic lives as a ~1000-line monolith in `tasks_scan.py`.
- [ ] **MEDIUM** — Many profile modules are **no-ops** reporting `issues_found: 0` with zero checks (`owasp`, `tls`, `web_crawl`, `secret_scan`, …); `deep_web_gray_box` intrusive tools are gated only by user-controllable config.
  - Location: `backend/scans/profiles/__init__.py`, `backend/workers/tasks_scan.py:515-520`
- [ ] **MEDIUM** — Backend Dockerfile runs uvicorn `--reload` (dev mode) **as root** with no healthcheck.
  - Location: `backend/Dockerfile`
- [x] **MEDIUM** — Mutable default args in Pydantic schemas (`config: dict = {}`, `asset_ids: list = []`).
  - Location: `backend/api/schemas/__init__.py:144-195`
- [ ] **MEDIUM** — No server-side route protection in Next.js (no `middleware.ts`); auth redirect is client-only.
  - Location: `frontend/components/layout/application-shell.tsx:18`
- [ ] **MEDIUM** — `useAgentActivity` injects **simulated live events every 9s** into a security dashboard.
  - Location: `frontend/hooks/use-agent-activity.ts`
- [ ] **MEDIUM** — API client hardcodes a **direct backend URL on port 8002** for AI-agent paths, bypassing the NGINX proxy.
  - Location: `frontend/lib/api-client.ts:81`

---

## 🟡 LOW — Nice to have

- [ ] **LOW** — `/health` and root report "operational" without checking anything; dashboard returns fabricated `latency_ms`.
  - Location: `backend/main.py:121-130`, `backend/api/routes/dashboard.py:390-400`
- [ ] **LOW** — `AI_BASE_URL` default embeds a private IP (`192.168.220.204`).
  - Location: `backend/config.py:35`, `docker-compose.yml`
- [ ] **LOW** — `datetime.utcnow()` (deprecated) mixed with aware datetimes.
  - Location: `backend/**`
- [ ] **LOW** — `NullPool` on the async engine (no connection reuse).
  - Location: `backend/database/__init__.py`
- [ ] **LOW** — `celerybeat-schedule` runtime artifact committed to the repo.
  - Location: `backend/celerybeat-schedule`
- [ ] **LOW** — Report renderer's `_stable_finding_id` maps many findings to the same ID (`NST-WEB-001`), producing duplicate HTML anchors.
  - Location: `backend/reporting/professional_report.py:428-434`
- [ ] **LOW** — Test coverage is thin: backend has only health/root/project tests; frontend unit tests cover UI rendering only.
  - Location: `tests/backend/test_api.py`, `frontend/tests/unit/*`

---

## ✅ Done well (keep)

- No dangerous code execution anywhere — no `eval`/`exec`/`shell=True`; all subprocess calls use argument lists; scan behavior is bounded (timeouts, rate limits, port lists).
- Real RBAC + separation of duties: role checker hierarchy, admin can't demote/disable self, approvals can't be self-granted, AI tool-requests are genuinely ownership-gated.
- Defensive report renderer: Jinja2 autoescape, SHA-256 evidence hashing, redaction, blocking validation.
- Emergency controls done right: typed confirmations + Celery `SIGKILL` revoke.
- Consistent async DB usage and a clean, well-documented layered architecture.

---

## 🎯 Suggested fix order

1. Add auth + ownership to `reports.py` (unauthenticated report/export access).
2. Enforce the validation gate in `start_scan`, scheduler, and discovery (approval/scope/safety bypasses).
3. Remove the `safe_only → authorized_internal` bypass and harden `validate_scope`.
4. Remove `_generate_sample_findings` and stop auto-marking findings `verified/confirmed`.
5. Remove mock-data fallbacks in `ai-agents.ts` (frontend) and the in-memory agent control plane.
6. Fail fast on default `SECRET_KEY`; rotate/remove hardcoded admin credentials.
7. Introduce Alembic migrations and object-level authorization.
8. Repair the failed CVE sync, recover recent records, then add cursor-based pagination and freshness monitoring.
