# Security Model

## Security objectives

The platform must ensure that:

1. Users can access only authorized projects and their child resources.
2. A guessed identifier cannot bypass project ownership.
3. Only approved, in-scope assets are scanned.
4. Restricted scans require independent approval.
5. Approval does not bypass a changed or expired scope.
6. Scanner execution can be stopped and audited.
7. Findings, evidence, reports, credentials, and AI data remain confidential.

## Trust boundaries

| Boundary | Main risk | Required control |
| --- | --- | --- |
| Browser ↔ ingress | Session theft, injection, interception | TLS, CSP, secure session design, rate limiting |
| Ingress ↔ API | Spoofed proxy data, bypass | Private networking and trusted proxy configuration |
| API ↔ database | Injection, overprivilege, data exposure | Parameterized ORM queries, TLS, least-privilege DB role |
| API ↔ Redis/workers | Task forgery or tampering | Private authenticated broker, queue separation |
| Worker ↔ target | Out-of-scope or disruptive scanning | Scope validation, egress policy, isolated workers |
| Backend ↔ AI provider | Sensitive prompt leakage or unsafe actions | Private endpoint, redaction, structured tools, approvals |
| Operator ↔ pgAdmin | Full database compromise | Private access, MFA/SSO, separate credentials, auditing |

## RBAC and project authorization

The role hierarchy grants operation capability, while project ownership grants resource visibility.

- `admin` is the only global project role.
- `manager` and `security_team` can review approvals only for projects accessible to them.
- `analyst` can perform normal assessment workflows in owned projects.
- `viewer` is read-oriented, although individual routes must still enforce the intended mutation role.

Authorization helpers join child resources through `Project` and apply `Project.owner_id == current_user.id` for non-admin users. Inaccessible resources return `404`, limiting resource enumeration.

Every new route must preserve this invariant. Frontend navigation restrictions are not a security boundary.

## Scan safety model

Before execution, the backend evaluates project access, engagement relationship and authorization, target association, asset scope and approval, time window, profile risk, configuration, and approval validity.

Approval is time-bound. The request is validated again when a reviewer approves it. Successful approval queues execution automatically, reducing the chance that configuration changes occur between approval and launch.

Prohibited actions include denial of service, brute force, credential theft, malware, persistence, unauthorized pivoting, data exfiltration, and production data modification.

Infrastructure egress controls must reinforce application validation; application checks alone are not a complete containment boundary.

## Authentication model

The current implementation uses signed JWT access and refresh tokens.

Known characteristics:

- Login is rate-limited by application logic.
- Accounts can be disabled.
- Access tokens expire based on `JWT_EXPIRATION`.
- Refresh tokens expire based on `REFRESH_TOKEN_EXPIRATION`.
- Logout does not revoke an already issued token server-side.
- MFA is not implemented.
- Stored API tokens are not yet recognized by request authentication.

Production should add MFA/SSO, server-side revocation or short-lived access tokens with rotation controls, service-token scope enforcement, and security monitoring.

## Sensitive data

Classify the following as confidential or restricted:

- Credentials, API keys, session tokens, and private keys.
- Asset inventory, internal domains, IP addresses, and service metadata.
- Findings, proof, payloads, screenshots, evidence, and reports.
- Rules of engagement and testing windows.
- AI prompts and outputs containing customer context.
- Audit records and administrator activity.

Encrypt data in transit and at rest, define retention and deletion policies, and restrict report/evidence downloads.

## Security review checklist for changes

- Does the route require authentication?
- Is the role requirement correct on the server?
- Is every resource resolved through the current user’s project scope?
- Are parent-child relationships validated?
- Can the operation be replayed or raced?
- Is the state transition legal?
- Does it need approval or separation of duties?
- Is an audit record generated?
- Could logs or errors expose secrets or inaccessible data?
- Does background execution repeat authorization and scope checks?
- Are denial, cross-project, and malformed-input tests included?
