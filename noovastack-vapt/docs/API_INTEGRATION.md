# API and Integration Guide

## Base URL and format

Use the reverse-proxy URL in deployed environments:

```text
https://vapt.example.com/api
```

JSON is used for most requests and responses. Login is the exception: it accepts OAuth2 form fields.

## Authentication

### Obtain JWT tokens

```bash
curl --fail-with-body -X POST 'https://vapt.example.com/api/auth/login' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'username=analyst@example.com' \
  --data-urlencode 'password=REDACTED'
```

The response contains `access_token`, `refresh_token`, `token_type`, and `expires_in`. Store tokens in a secret store or protected process memory, never in source control or build logs.

Use the access token:

```bash
curl --fail-with-body 'https://vapt.example.com/api/projects' \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Refresh the session before access-token expiry:

```bash
curl --fail-with-body -X POST \
  "https://vapt.example.com/api/auth/refresh?refresh_token=$REFRESH_TOKEN"
```

### Current API-token limitation

The `/api/auth/tokens` endpoints create, list, and revoke hashed token records, but the current authentication dependency validates JWT access tokens only. Do **not** build production automation around generated API tokens until bearer-token lookup and scope enforcement are implemented and tested.

For current integrations, use a dedicated least-privileged service user with JWT login and refresh. Protect its credentials and rotate them regularly.

## Core integration workflow

### Create a project

```bash
curl --fail-with-body -X POST 'https://vapt.example.com/api/projects' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Customer Portal",
    "description": "Authorized staging assessment",
    "environment": "staging"
  }'
```

Store the returned `id` as `PROJECT_ID`.

### Create and authorize an engagement

```bash
curl --fail-with-body -X POST \
  "https://vapt.example.com/api/projects/$PROJECT_ID/engagements" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Staging release assessment",
    "assessment_mode": "black_box",
    "testing_window_start": "20:00",
    "testing_window_end": "23:00",
    "rules_of_engagement": "Safe checks only; no denial of service or credential attacks."
  }'
```

Authorization is a privileged governance action:

```bash
curl --fail-with-body -X POST \
  "https://vapt.example.com/api/engagements/$ENGAGEMENT_ID/authorize" \
  -H "Authorization: Bearer $MANAGER_ACCESS_TOKEN"
```

### Register and approve an asset

```bash
curl --fail-with-body -X POST \
  "https://vapt.example.com/api/projects/$PROJECT_ID/assets" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "asset_type": "website",
    "value": "https://staging.example.com",
    "name": "Portal staging",
    "environment": "staging",
    "tags": ["customer-portal"]
  }'
```

An authorized reviewer approves the asset through `POST /api/assets/{asset_id}/approve` after verifying scope.

### Create and validate a scan

```bash
curl --fail-with-body -X POST 'https://vapt.example.com/api/scans' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"engagement_id\": \"$ENGAGEMENT_ID\",
    \"name\": \"Portal safe web scan\",
    \"assessment_mode\": \"black_box\",
    \"scan_category\": \"website\",
    \"scan_depth\": \"quick\",
    \"scan_profile_id\": \"quick_web_black_box\",
    \"asset_ids\": [\"$ASSET_ID\"],
    \"config\": {\"safe_only\": true, \"advanced_options\": []}
  }"
```

Validate before submitting:

```bash
curl --fail-with-body -X POST \
  "https://vapt.example.com/api/scans/$SCAN_ID/validate" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Only continue when `valid` is `true`.

### Request approval

```bash
curl --fail-with-body -X POST \
  "https://vapt.example.com/api/scans/$SCAN_ID/request-approval" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

After an authorized reviewer approves the request, execution starts automatically. Integration code should poll progress rather than call Start after approval.

### Monitor and collect results

```text
GET /api/scans/{scan_id}/progress
GET /api/scans/{scan_id}/events
GET /api/scans/{scan_id}/safety
GET /api/scans/{scan_id}/findings
GET /api/reports/scan/{scan_id}/data
GET /api/reports/scan/{scan_id}/export?format=json
```

Poll with exponential backoff and a maximum interval. Treat `failed`, `blocked`, `cancelled`, and `killed` as terminal states requiring review.

## CI/CD integration pattern

Recommended pipeline behavior:

1. Use a dedicated project and service user for each application team.
2. Scan a controlled staging target, repository snapshot, or container image.
3. Create or reuse approved assets outside the build job.
4. Request a safe scan and wait for approval when policy requires it.
5. Poll to a bounded timeout.
6. Download machine-readable JSON results.
7. Fail the release only on an agreed policy such as verified critical findings.
8. Publish a link to the platform result; do not copy confidential evidence into public CI logs.

## Error handling

| HTTP status | Meaning |
| --- | --- |
| `400` | Invalid configuration or state transition; inspect `detail` |
| `401` | Missing, invalid, or expired token |
| `403` | Authenticated but insufficient role |
| `404` | Missing or inaccessible resource; the API intentionally hides cross-project resources |
| `409` | Conflicting state where implemented |
| `422` | Request-schema validation failure |
| `429` | Authentication rate limit reached |
| `503` | Valid work could not be dispatched to a worker |

Do not automatically retry `400`, `403`, or `422`. Retry transient `503` and network failures with bounded exponential backoff and idempotency awareness.

## Versioning guidance

The current API is not namespaced by version. Integrators should pin to a tested platform release, validate the OpenAPI schema during upgrades, and use contract tests for critical workflows. Introduce `/api/v1` before making incompatible public API changes.
