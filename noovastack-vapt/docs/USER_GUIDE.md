# User Guide

## What NoovaStack VAPT does

NoovaStack VAPT manages an authorized security-assessment lifecycle:

```text
Project → Engagement → Asset registration → Scope approval → Scan request
        → Security approval → Automatic execution → Findings → Remediation → Retest → Report
```

Only test systems for which your organization has explicit authorization. A target being reachable does not mean it is approved for scanning.

## Sign in and account behavior

Sign in with your email or username and password. The current application uses access and refresh tokens for sessions.

- MFA is not implemented in the current release.
- Ask an administrator to disable an account that should no longer have access.
- Change your password from account settings if compromise is suspected.
- Do not share accounts or paste credentials into findings, comments, evidence, or AI prompts.

## Roles

| Role | Typical use |
| --- | --- |
| `viewer` | Read accessible project data and reports |
| `analyst` | Create projects and authorized assessment work |
| `security_team` | Review security operations and approvals |
| `manager` | Review approvals and manage security workflows |
| `admin` | Platform superadministrator with global project visibility and system configuration |

Non-admin users only receive projects they own. Resource lookups join through the project and return `404` when the project is outside the user’s scope. This prevents project identifiers from granting cross-project access.

The CVSS Calculator and System Administrator pages are administrator-only.

## Dashboard

The default dashboard answers the immediate questions:

- What is the current security score?
- How many projects, scans, findings, and reports are active?
- Which vulnerability severities exist?
- What should be handled next?

Open **Detailed analytics** for four focused views:

| View | Question answered |
| --- | --- |
| Risk overview | Where are we exposed? |
| Scan health | Are scans running successfully and covering assets? |
| Fix progress | Are findings being remediated within SLA? |
| Platform operations | Are automation and workers healthy? Administrator only. |

Filters affect the analytics data, not the user’s access permissions.

## Create an assessment

### 1. Create a project

Open **Projects → New Project**. Use one project for one application, system, business service, or clearly owned environment. Record the correct environment: production, staging, testing, or development.

### 2. Define the engagement

An engagement records assessment mode, dates, testing window, and rules of engagement.

- **Black box:** external knowledge only.
- **Gray box:** limited credentials or documentation.
- **White box:** source, architecture, and deeper internal context.

The engagement must be authorized and active before its assets can be scanned.

### 3. Register assets

Open **Assets** to register a domain, URL, API, IP address, service, repository, or container target. You may also use discovery or an asset group.

Each asset has two independent controls:

- `scope_status` confirms whether the target belongs to the approved assessment scope.
- `approval_status` confirms whether the target may be used by a scan.

Do not scan an asset until it is both in scope and approved.

### 4. Request a scan

Open **Scans → New Scan**, then select:

1. Project and engagement.
2. Approved target assets.
3. Category and profile.
4. Assessment mode and depth.
5. Safe configuration options.

The platform validates project ownership, asset-project relationships, engagement status, scope, asset approval, testing window, safety configuration, and approval state.

### 5. Approval and automatic start

When approval is required, submit the scan request once. A manager, security-team member, or administrator reviews it.

After approval, the backend validates the request again and queues the scan automatically. The requester does **not** need to click Start after approval. If dispatch fails, the scan remains approved so an operator can retry without requesting approval again.

Non-admin approvers cannot approve their own restricted request.

### 6. Monitor the scan

The progress view displays scan stage, modules, progress, events, safety state, evidence, and candidate findings. A manager or administrator can pause or emergency-stop work when required.

Common statuses include:

| Status | Meaning |
| --- | --- |
| `draft` | Configuration is being prepared |
| `pending_review` | Waiting for approval |
| `approved` | Authorized but not yet dispatched or awaiting retry |
| `pending` / `running` | Queued or executing |
| `paused` | Temporarily stopped by an authorized operator |
| `completed` | Execution finished |
| `failed`, `blocked`, `cancelled`, `killed` | Attention or intervention required |

## Findings and remediation

Use **Findings** to review severity, status, evidence, technical detail, remediation guidance, and comments. The workflow supports verification, rejection, false-positive handling, remediation status, and retesting.

Recommended handling:

1. Validate evidence and affected asset.
2. Confirm severity and business impact.
3. Assign remediation ownership outside the platform if no owner field is configured.
4. Record useful technical context without secrets.
5. Move the finding through remediation status.
6. Create a retest after the fix is deployed.
7. Close only after evidence confirms the issue is resolved.

## Reports

Reports are generated from stored scan, finding, and evidence data. Supported exports include HTML, JSON, PDF, DOCX, Markdown, and evidence ZIP.

- Treat every report as confidential.
- Review AI-generated or automatically generated language before external delivery.
- Verify that the report contains only the intended project and engagement.
- Store exports in an approved encrypted repository with a retention policy.

## Generative AI

The AI workspace can assist with planning, explanation, remediation, validation, and report drafting. It does not replace authorization or human review.

Never provide the model with passwords, tokens, private keys, customer secrets, or unrelated customer data. AI tool requests remain subject to platform authorization and safety controls.

## Domain monitoring and CVE intelligence

Domain monitoring records changes for approved project domains. Visibility follows project ownership; the system administrator can view all projects.

CVE intelligence is synchronized daily from configured public intelligence sources, and Nuclei templates are updated on a daily worker schedule. A CVE match is an indicator for validation, not proof that an asset is vulnerable.
