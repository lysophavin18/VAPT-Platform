# NoovaStack VAPT Documentation

This directory is the product wiki for users, administrators, developers, integrators, and production operators. It documents the behavior implemented in this repository rather than an aspirational product design.

Last verified against the source code: **2026-10-21**.

## Start here

| Audience | Document | Purpose |
| --- | --- | --- |
| Security user, developer, viewer | [User Guide](USER_GUIDE.md) | Use projects, assets, scans, findings, reports, and dashboards |
| Platform administrator | [Administrator Guide](ADMIN_GUIDE.md) | Manage users, approvals, CVE data, scanner health, and pgAdmin |
| Application developer | [Developer Guide](DEVELOPER_GUIDE.md) | Understand the repository, run it locally, test, and extend it |
| API or CI/CD integrator | [API and Integration Guide](API_INTEGRATION.md) | Authenticate and integrate through the current REST API |
| Infrastructure or DevOps team | [Production Deployment Guide](PRODUCTION_DEPLOYMENT.md) | Build a hardened production architecture and release process |
| On-call operator | [Operations Runbook](OPERATIONS_RUNBOOK.md) | Monitor, back up, recover, deploy, and respond to incidents |
| Security reviewer | [Security Model](SECURITY_MODEL.md) | Understand trust boundaries, RBAC, project isolation, and safety controls |
| Support engineer | [Troubleshooting](TROUBLESHOOTING.md) | Diagnose common application, worker, database, and pgAdmin problems |

Additional references:

- [Architecture](../ARCHITECTURE.md)
- [Root README](../README.md)
- Interactive OpenAPI documentation: `/api/docs` (administrator JWT required)
- OpenAPI schema: `/api/openapi.json` (administrator JWT required)

## Product status and production readiness

The application implements the core VAPT workflow, project-level access control, scan safety validation, controlled approvals, asynchronous workers, reporting, domain monitoring, CVE intelligence, and audit records.

The included Docker Compose file is intended for local development and controlled lab use. It is **not a secure production manifest as shipped**. Before production, at minimum:

1. Move every password and signing key to a secret manager.
2. Remove public PostgreSQL, Redis, backend, and pgAdmin port exposure.
3. terminate TLS at a trusted ingress and restrict administration through VPN or an identity-aware proxy.
4. Isolate scanner workers from application and data networks.
5. Add database migrations, tested backups, centralized logs, metrics, alerts, and disaster recovery.
6. Complete MFA or SSO before allowing privileged internet-facing access.
7. Complete API-token authentication and scope enforcement before using generated API tokens for automation.
8. Add token revocation/session invalidation if immediate logout is a policy requirement.

See [Production Deployment](PRODUCTION_DEPLOYMENT.md) for the complete checklist.

## Documentation rules

- Never place real credentials, tokens, customer domains, or private IP addresses in documentation.
- Use placeholders such as `https://vapt.example.com`, `$ACCESS_TOKEN`, and `$PROJECT_ID`.
- Update the relevant guide in the same change that modifies a workflow or public API.
- Treat exported reports and evidence as confidential security data.
