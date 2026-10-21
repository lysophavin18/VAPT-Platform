# Production Deployment Guide

## Deployment decision

The included Docker Compose stack is a local/lab baseline. A production deployment should use managed infrastructure or an orchestrator with immutable images, secret injection, health checks, resource limits, network policies, rolling releases, and durable storage.

Do not expose the current Compose stack directly to the internet.

## Recommended hybrid architecture

```text
Users / CI
    |
WAF or identity-aware proxy
    |
TLS ingress / load balancer
    |
Frontend ── Backend API ── Managed PostgreSQL
                    |  └── Managed Redis
                    |       └── Celery scheduler
                    |
                    └── Private job queue
                            ├── Passive/standard scanner pool
                            ├── Deep scanner pool
                            └── Ephemeral per-scan jobs
                                      |
                              Approved target networks only

Private AI endpoint and object storage are reachable only from approved backend/worker identities.
```

This combines three useful patterns:

- **Centralized orchestration** for policy, scheduling, evidence, and reports.
- **Ephemeral or agent-based workers** for segmented environments and stronger scan isolation.
- **CI/CD integration** through the API for shift-left staging, repository, and image checks.

Cloud API scanning can be added as a separate connector class with least-privilege cloud identities.

## Environment separation

Maintain independent development, staging, and production environments with separate:

- Domains, TLS certificates, databases, Redis instances, buckets, queues, secrets, and AI endpoints.
- Scanner egress policies and target allowlists.
- Administrator and service accounts.
- Audit and monitoring destinations.

Never use production customer targets while testing a platform release.

## Required security changes

### Secrets

- Replace hardcoded PostgreSQL and Redis credentials in Compose.
- Generate a unique `SECRET_KEY` of at least 32 random bytes.
- Use separate secrets for database, Redis, pgAdmin, AI providers, and initial administrator.
- Inject secrets at runtime from Vault, cloud secret managers, SOPS, or sealed secrets.
- Remove `INITIAL_ADMIN_PASSWORD` after initial account creation or rotation.
- Rotate any credential exposed in chat, screenshots, shell history, or source control.

### Network

- Expose only the TLS ingress endpoint.
- Keep PostgreSQL, Redis, backend, workers, AI, and pgAdmin on private networks.
- Restrict pgAdmin to a temporary administrative access path.
- Deny scanner access to metadata services, control planes, databases, and internal networks unless explicitly in scope.
- Use per-engagement egress allowlists where possible.

### Identity

- Complete MFA or enterprise SSO for privileged users.
- Disable public registration unless explicitly required; current registration creates an active viewer.
- Use named accounts and least privilege.
- Add server-side session/token revocation for immediate logout and incident response.
- Complete API-token validation and scope enforcement before service-token use.

### Application

- Configure exact HTTPS CORS origins.
- Add secure cookie-based session handling if tokens move from browser session storage.
- Rate-limit authentication and expensive operations at both ingress and application layers.
- Pin dependency and container versions; avoid `latest` tags in production.
- Add SAST, dependency, secret, IaC, and container scanning to CI.
- Generate an SBOM for each release.

## Data services

Use managed PostgreSQL when available, with:

- TLS-required connections.
- Encryption at rest.
- Multi-zone high availability.
- Automated backups and point-in-time recovery.
- A least-privilege application role and a separate migration role.
- Query and connection monitoring.

Use managed or hardened Redis with TLS, authentication, private access, persistence appropriate to queue durability, and memory/eviction alerts.

Move reports and evidence from local container volumes to encrypted object storage. Use short-lived signed downloads and explicit retention policies.

## Worker isolation

Scanner workers execute security tools and should be treated as high-risk workloads.

- Run them separately from the API and database.
- Prefer one ephemeral job/container per scan.
- Use non-root users, read-only root filesystems, dropped capabilities, seccomp/AppArmor, and strict CPU/memory/PID limits.
- Mount only the data required by the scan.
- Destroy ephemeral workspaces after evidence transfer.
- Separate passive, standard, authenticated, and deep scan pools.
- Maintain an emergency queue stop and target-level denylist.

## Availability and scaling

- Run multiple frontend and API replicas behind a load balancer.
- Scale workers by queue and risk class, not only aggregate CPU.
- Run one active Celery Beat scheduler or use leader election.
- Set worker task time limits and graceful shutdown periods.
- Use readiness checks that verify required dependencies without causing load.
- Define recovery objectives for database, evidence, and service restoration.

## Observability

Collect:

- Structured API and worker logs with correlation IDs.
- Request rate, latency, error rate, and saturation.
- Queue depth, wait time, task runtime, retries, and failures.
- Scan outcomes, blocked actions, safety events, and emergency stops.
- PostgreSQL connections, locks, storage, replication, and backup age.
- Redis memory, evictions, persistence, and connectivity.
- CVE-feed and Nuclei-template update age.
- Authentication failures and privileged actions.

Alert on user impact and security signals. Do not log access tokens, passwords, raw secrets, sensitive evidence, or full AI prompts containing customer data.

## Release pipeline

1. Run unit, integration, authorization, and browser tests.
2. Build immutable images tagged with commit SHA and release version.
3. Scan dependencies, images, IaC, and secrets.
4. Generate and retain SBOMs and provenance.
5. Apply reviewed database migrations as a controlled job.
6. Deploy to staging and execute smoke and rollback tests.
7. Back up production and verify restore readiness.
8. Roll out gradually with health and error gates.
9. Verify API, workers, queues, scans, reporting, and audit export.
10. Record release, migration, and operator evidence.

## Production go-live checklist

- [ ] TLS, HSTS, trusted proxy headers, and exact CORS are configured.
- [ ] No data service or administrative interface is publicly reachable.
- [ ] All local/default credentials are replaced and stored securely.
- [ ] MFA/SSO and account offboarding are operational.
- [ ] Project-isolation and IDOR tests pass.
- [ ] Database migrations, backup, restore, and rollback are tested.
- [ ] Worker egress and resource controls are enforced.
- [ ] Reports and evidence use encrypted durable storage.
- [ ] Logs, metrics, alerts, and on-call ownership are active.
- [ ] CVE and scanner-content update monitoring is active.
- [ ] Incident response, emergency stop, and customer notification procedures are approved.
- [ ] Retention, deletion, privacy, and compliance requirements are documented.
- [ ] Known gaps have formal risk acceptance and deadlines.
