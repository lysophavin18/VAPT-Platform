# Operations Runbook

## Service inventory

| Service | Function |
| --- | --- |
| `frontend` | Next.js user interface |
| `backend` | FastAPI application and REST API |
| `postgres` | Primary relational data store |
| `redis` | Celery broker and result backend |
| `celery-worker` | Discovery, scan, report, schedule, AI, and monitoring jobs |
| `celery-beat` | Scheduled dispatch, CVE updates, and monitoring intervals |
| `nginx` | Local reverse proxy |
| `pgadmin` | Localhost-only database administration UI |

## Routine checks

```bash
docker compose ps
curl --fail http://127.0.0.1:8002/health
curl --fail http://127.0.0.1:3000/
docker compose logs --tail=100 backend celery-worker celery-beat
```

Also review queue backlog, failed scans, blocked safety actions, database capacity, backup age, CVE synchronization age, and expiring approvals.

## Start, stop, and rebuild

```bash
docker compose up -d
docker compose stop
docker compose up -d --build backend frontend celery-worker celery-beat nginx
```

Avoid `docker compose down -v`; `-v` removes named data volumes.

## Database backup

Create a timestamped logical backup outside the database container:

```bash
mkdir -p backups
docker compose exec -T postgres \
  pg_dump -U noovastack -d noovastack_vapt -Fc \
  > backups/noovastack_vapt_YYYYMMDD_HHMM.dump
```

Protect backups as confidential, encrypt them, copy them off-host, and test restoration regularly.

## Restore drill

Restore only into an isolated non-production database first:

```bash
createdb_command='createdb -U noovastack noovastack_vapt_restore_test'
docker compose exec -T postgres sh -lc "$createdb_command"
docker compose exec -T postgres \
  pg_restore -U noovastack -d noovastack_vapt_restore_test --clean --if-exists \
  < backups/noovastack_vapt_YYYYMMDD_HHMM.dump
```

Validate row counts, application startup, project access, findings, reports, and audit records. A production restore requires an approved change plan and maintenance window.

## Log collection

```bash
docker compose logs --since=30m backend
docker compose logs --since=30m celery-worker
docker compose logs --since=30m celery-beat
docker compose logs --since=30m postgres
```

Redact credentials, tokens, target data, and evidence before sharing logs.

## Stuck scan procedure

1. Confirm scan status in the UI and database.
2. Check scan events and worker logs using the scan ID.
3. Verify Redis and worker health.
4. Determine whether the task is active, queued, or lost.
5. Pause or emergency-stop if target impact is possible.
6. Preserve evidence and logs.
7. Retry only after confirming scope, authorization, and idempotency.
8. Record the incident and corrective action.

Do not manually mark a scan completed merely to clear a dashboard warning.

## Approval dispatch failure

If approval succeeds but queue dispatch fails, the scan returns to `approved`. Restore worker/broker health, then perform a controlled retry. Do not create duplicate approvals unless the existing approval expired or the security configuration changed.

## CVE synchronization failure

1. Check Celery Beat emitted the daily task.
2. Check worker network access to configured intelligence sources.
3. Review rate limits and source status.
4. Confirm database writes and `cve_sync_state` timestamps.
5. Retry with bounded result sizes.
6. Alert users that intelligence freshness is degraded.

## Credential incident

If a secret is exposed:

1. Treat it as compromised immediately.
2. Revoke or rotate it at the source.
3. Restart affected services with the new secret.
4. Invalidate sessions where supported.
5. Review authentication and audit logs.
6. Remove the value from screenshots, tickets, chat, shell history, and Git history where possible.
7. Document impact and prevention work.

## Emergency scan incident

1. Stop the affected scan or all scan workers if required.
2. Notify the system owner and incident commander.
3. Preserve audit events, worker logs, task IDs, and target telemetry.
4. Block further egress to the target.
5. Determine whether scope, configuration, scanner behavior, or operator action caused the event.
6. Require reauthorization before resuming.

## pgAdmin operations

```bash
docker compose up -d pgadmin
docker compose ps pgadmin
docker compose logs --tail=100 pgadmin
```

Access it only through `http://127.0.0.1:5050` or a protected tunnel. Stop it when administrative work is complete if policy requires temporary access:

```bash
docker compose stop pgadmin
```
