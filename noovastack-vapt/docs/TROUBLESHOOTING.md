# Troubleshooting

## First checks

```bash
docker compose ps
docker compose logs --tail=100 backend frontend celery-worker celery-beat postgres redis
```

Confirm the failure is in the browser, API, worker, database, broker, scanner tool, or external intelligence/AI service before changing data.

## Login returns “Incorrect email or password”

- Confirm the application email/username, not the pgAdmin account.
- Check that the account is active.
- Verify backend time and JWT configuration.
- Do not repeatedly guess production credentials; use the approved reset process.

The application login and pgAdmin login are different authentication systems.

## pgAdmin account locked

Repeated failed pgAdmin logins can lock the account. An operator can reset it with the pgAdmin setup utility or recreate a non-production pgAdmin volume. Do not delete a production volume without a recovery plan.

After unlocking, verify `login_attempts=0`, `locked=0`, and test one known-good login.

## pgAdmin asks for the PostgreSQL password

This is expected. pgAdmin has one login password, while the registered PostgreSQL server has a separate database password. Retrieve it from the approved secret manager. Do not save the database password in a shared browser profile.

## Backend starts but the frontend shows no data

- Check browser network responses under `/api/`.
- Confirm CORS allows the exact frontend origin.
- Verify the access token has not expired.
- Confirm the user owns a project or is an administrator.
- Check backend logs for `401`, `403`, `404`, and database errors.

## User cannot see another project

That is expected for every non-admin role. Project ownership controls data visibility. A manager role does not automatically grant global project visibility. Reassign ownership through an approved administrative process or use the system administrator account for global review.

## Scan remains pending review

- Confirm an approval exists and has not expired.
- Confirm the reviewer is `admin`, `manager`, or `security_team`.
- Non-admin reviewers cannot approve their own restricted requests.
- Recheck asset scope, asset approval, engagement authorization, and testing window.

## Scan approved but not running

- Check whether status is `approved`; this indicates automatic dispatch may have failed.
- Check Redis, worker, and `scan` queue health.
- Review `dispatch_failed` events.
- Retry only after the queue is healthy; avoid duplicate scans.

## Worker does not process jobs

```bash
docker compose logs --tail=200 celery-worker
docker compose logs --tail=200 redis
docker compose restart celery-worker
```

Confirm broker URL, queue names, worker registration, target connectivity, scanner binaries, and filesystem permissions.

## Scheduled scans do not run

- Verify `celery-beat` and `celery-worker` are both running.
- Confirm the schedule is enabled and authorized.
- Check timezone and next-run computation.
- Review schedule history and worker logs.

## CVE data is stale

- Check the daily task in Celery Beat logs.
- Verify worker internet access to configured NVD/CISA sources.
- Check rate limits and TLS/DNS errors.
- Inspect `cve_sync_state` and last successful timestamps.
- Verify the reporting queue is being consumed.

## AI assistant unavailable

- Check `AI_BASE_URL`, model name, API key, and timeout.
- Call `/api/ai-agents/local-model/health` as an authenticated user.
- Confirm the backend can reach the AI endpoint from its network.
- Ensure no customer secrets are copied into diagnostic prompts.

## Database connection errors

- Containers should connect to host `postgres` on port `5432`.
- Host processes normally connect to `127.0.0.1` on the mapped development port.
- Confirm username, database, password, TLS policy, and URL encoding for special characters.
- Check PostgreSQL readiness and connection limits.

```bash
docker compose exec -T postgres pg_isready -U noovastack -d noovastack_vapt
```

## Safe escalation package

Provide support with:

- Release/commit identifier and environment.
- UTC timestamp and user role.
- Project, scan, or task ID where permitted.
- Expected and actual status.
- Sanitized API status/error and relevant log lines.
- Whether the issue reproduces in staging.

Never include passwords, bearer tokens, database dumps, unredacted findings, private customer targets, or raw confidential evidence.
