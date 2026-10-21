# Administrator Guide

## Administrator responsibilities

The `admin` role is the platform superadministrator. It has global project visibility and may manage users, system configuration, scanner tools, approvals, audit records, CVE intelligence, and operational health.

Use a named administrator account for each person. Do not share the seeded account in production.

## User lifecycle

New self-registered accounts receive the `viewer` role. An administrator can update account profiles and roles from **System Administrator**.

Recommended process:

1. Verify the person’s identity and organizational owner.
2. Assign the least-privileged role.
3. Confirm which projects the person should own.
4. Disable access immediately during offboarding.
5. Review audit logs after privileged role changes.

Role hierarchy enforced by the backend:

```text
admin (4)
manager / security_team (3)
analyst (2)
viewer (1)
```

Project ownership is separate from role. Only `admin` has global project access; all other roles are constrained by `projects.owner_id`.

## Scope and asset governance

Before approving an asset, verify:

- Written authority exists for the target.
- The value resolves to the intended organization and environment.
- Parent domains, IP ranges, ports, APIs, and third-party services are explicitly covered.
- The testing window and prohibited actions are recorded.
- Production impact and escalation contacts are understood.

Reject or leave pending any target with uncertain ownership.

## Scan approvals

Approvals may be reviewed by `admin`, `manager`, or `security_team` roles. The system prevents a non-admin reviewer from approving their own restricted request.

Approval behavior:

1. The request is validated before entering the approval queue.
2. Approval expires after its configured period; scan requests currently use 24 hours.
3. The system validates scope and readiness again at decision time.
4. Approval automatically dispatches the scan.
5. Rejection blocks a scan; requesting more information returns it to draft.

Review target, project, engagement, assets, profile, depth, environment, testing window, and risk before approval.

## Emergency controls

Use pause, cancel, emergency stop, or kill when a scan:

- Leaves approved scope.
- Causes instability or unacceptable load.
- Runs outside the testing window.
- Uses an unexpected module or target.
- Receives a request from the system owner or incident commander to stop.

After stopping, preserve events and evidence, document the reason, and investigate before restarting.

## Scanner and worker health

Check service state:

```bash
docker compose ps
docker compose logs --tail=200 backend celery-worker celery-beat
```

The administration page reports available scanner tools. Worker queues include asset discovery, scan execution, reporting, scheduling, AI, and monitoring. A healthy API does not prove a healthy worker; verify both.

## CVE intelligence

Celery Beat schedules daily CVE intelligence synchronization and Nuclei template updates. Administrators can inspect status and trigger synchronization through `/api/cve/status` and `/api/cve/sync`.

Operational checks:

```bash
docker compose logs --tail=200 celery-beat | rg 'cve|nuclei'
docker compose logs --tail=200 celery-worker | rg 'cve|nuclei'
```

Treat source outages as delayed intelligence, not as “no vulnerabilities.” Alert when synchronization age exceeds the organization’s threshold.

## Database administration with pgAdmin

The local stack exposes pgAdmin only on loopback:

```text
http://127.0.0.1:5050
```

The pgAdmin email is controlled by `PGADMIN_DEFAULT_EMAIL`; its password is initialized from `INITIAL_ADMIN_PASSWORD`. The registered server is **NoovaStack PostgreSQL**. PostgreSQL has a separate database password.

Browse application tables at:

```text
Servers → NoovaStack → NoovaStack PostgreSQL
→ Databases → noovastack_vapt → Schemas → public → Tables
```

Do not expose pgAdmin publicly. Prefer a VPN, SSH tunnel, or identity-aware administrative access path. Do not edit workflow rows directly unless following a reviewed recovery procedure; application-side validation and audit logging are bypassed by direct SQL.

## Audit review

Review audit records for:

- Authentication and privileged account changes.
- Project, engagement, asset, and scope changes.
- Approval decisions.
- Scan creation, launch, stop, or dispatch failure.
- Finding decisions and report generation.
- AI tool requests and emergency controls.
- CVE synchronization and system-setting changes.

Export important records to tamper-resistant centralized storage in production.

## Known administrative gaps

- MFA is not implemented.
- Logout acknowledges the client action but does not maintain a server-side JWT revocation list.
- API tokens can be created and revoked, but current request authentication validates JWT access tokens only.
- The local Compose file contains lab-oriented credentials and port mappings.
- Production-grade database migration and rollback procedures still need to be established.

These gaps must be included in production risk acceptance or resolved before launch.
