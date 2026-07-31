# NoovaStack VAPT Technical Security Assessment Report

**NoovaStack VAPT Platform**
**Noova Stack Technology Co., Ltd.**
**Classification: CONFIDENTIAL**

**Header:** Noova Stack Technology Co., Ltd. | CONFIDENTIAL
**Footer:** Noova Stack Technology Co., Ltd. | Do not distribute without authorization | Page X of Y

---

## 1. Cover Page

| Field | Value |
|---|---|
| Report Title | NoovaStack VAPT Technical Security Assessment Report |
| Classification | CONFIDENTIAL |
| Platform | NoovaStack VAPT Platform |
| Prepared By | Noova Stack Technology Co., Ltd. |
| Client | Not Provided |
| Project | NoovaStack Nmap Wapiti Verification - 192.168.220.209 |
| Assessment Type | Black-box website vulnerability assessment and penetration testing |
| Environment | testing |
| Scan Name | Nmap + Wapiti Verification - 192.168.220.209:3000 |
| Scan ID | 27989118-2d11-4597-ae37-aa426dbd8f7a |
| Report Generation Source | NoovaStack Platform |
| Report Viewed By | System Administrator, admin@noovastack.local |
| Report Generated At | 2026-07-17T07:34:04.228058 |
| Assessment Start | 2026-07-16T10:34:07.179709 |
| Assessment Completion | 2026-07-16T10:34:59.483150 |
| Overall Risk Rating | Medium |
| NoovaStack Logo | Not Provided |

---

## 2. Document Control

| Field | Value |
|---|---|
| Document Name | NoovaStack VAPT Technical Security Assessment Report |
| Classification | CONFIDENTIAL |
| Version | Not Provided |
| Report Owner | NoovaStack Platform |
| Prepared For | Not Provided |
| Prepared By | Noova Stack Technology Co., Ltd. |
| Reviewer | Not Provided |
| Approver | Not Provided |
| Distribution List | Not Provided |
| Retest Report Version | Not Provided |

| Revision | Date | Author | Description |
|---|---|---|---|
| Not Provided | 2026-07-17T07:34:04.228058 | NoovaStack Platform | Technical security assessment report generated from verified scan data. |

---

## 3. Confidentiality Notice

This document is classified as **CONFIDENTIAL** and contains security assessment information produced by NoovaStack VAPT Platform for an authorized vulnerability assessment and penetration testing activity. The information in this report may include details about application security posture, exposed services, verified weaknesses, remediation guidance, and security testing evidence.

This report must not be distributed, copied, or disclosed without authorization from the appropriate project owner or authorized representative. The report does not include passwords, API keys, tokens, session cookies, secrets, or sensitive production data. Where required information was unavailable from the NoovaStack VAPT Platform, the field is marked as **Not Provided**.

---

## 4. Table of Contents

| Section | Title |
|---:|---|
| 1 | Cover Page |
| 2 | Document Control |
| 3 | Confidentiality Notice |
| 4 | Table of Contents |
| 5 | Executive Summary |
| 6 | Assessment Overview |
| 7 | Scope |
| 8 | Assessment Methodology |
| 9 | Assessment Limitations |
| 10 | Risk Rating Methodology |
| 11 | Summary of Findings |
| 12 | Detailed Findings |
| 13 | Remediation Roadmap |
| 14 | Retest Summary |
| 15 | Positive Security Observations |
| 16 | Conclusion |
| 17 | Affected Assets |
| 18 | Evidence Manifest |
| 19 | References |
| 20 | Approval and Sign-Off |

---

## 5. Executive Summary

NoovaStack completed a black-box website vulnerability assessment and penetration testing activity for the project **NoovaStack Nmap Wapiti Verification - 192.168.220.209**. The assessment covered one tested asset and identified seven verified findings. The highest observed severity was **Medium**, resulting in an overall risk rating of **Medium**.

The assessment identified web security configuration weaknesses including unencrypted HTTP service exposure, missing browser security headers, and framework disclosure. NoovaStack also identified reachable TCP services on ports `3000` and `8082`. Wapiti confirmed multiple browser-side security control gaps, including missing Content Security Policy, missing clickjacking protection, and missing MIME type protection.

Management should prioritize enabling HTTPS, adding browser security headers, reviewing exposed services, and validating remediation through a follow-up retest.

### Key Observations

| Observation | Detail |
|---|---|
| Overall Risk | Medium |
| Total Verified Findings | 7 |
| Highest Severity | Medium |
| In-Scope Asset Count | 1 |
| Discovered Services | 192.168.220.209:3000, 192.168.220.209:8082 |
| Confirmed Tooling | nmap, Wapiti, NoovaStack safe HTTP checks |

---

## 6. Assessment Overview

| Field | Value |
|---|---|
| Client | Not Provided |
| Project ID | fd4a3db5-b1b4-4c0e-9cac-6a10442802fd |
| Project Name | NoovaStack Nmap Wapiti Verification - 192.168.220.209 |
| Assessment Mode | black_box |
| Assessment Category | website |
| Assessment Depth | quick |
| Environment | testing |
| Scan Status | completed |
| Scan Start | 2026-07-16T10:34:07.179709 |
| Scan Completion | 2026-07-16T10:34:59.483150 |
| Scanner Platform | NoovaStack VAPT Platform |
| Report Classification | CONFIDENTIAL |

### Scan Sessions and Tools

| Module | Tool | Status | Checks Performed | Issues Found | Started | Completed |
|---|---|---|---:|---:|---|---|
| passive_asset_discovery | nmap | completed | 9 | 1 | 2026-07-16T10:34:07.208314 | 2026-07-16T10:34:22.255604 |
| tcp_port_scan | nmap | completed | 9 | 1 | 2026-07-16T10:34:22.322665 | 2026-07-16T10:34:37.094734 |
| service_detection | nmap | completed | 9 | 1 | 2026-07-16T10:34:37.107437 | 2026-07-16T10:34:51.943222 |
| http_probe | NoovaStack safe HTTP checks | completed | 1 | 0 | 2026-07-16T10:34:51.957107 | 2026-07-16T10:34:52.160428 |
| tls_check | NoovaStack safe HTTP checks | completed | 1 | 1 | 2026-07-16T10:34:52.175703 | 2026-07-16T10:34:52.362554 |
| security_headers | NoovaStack safe HTTP checks | completed | 1 | 2 | 2026-07-16T10:34:52.409640 | 2026-07-16T10:34:52.571941 |
| safe_nuclei_templates | NoovaStack safe HTTP checks | completed | 1 | 2 | 2026-07-16T10:34:52.588605 | 2026-07-16T10:34:52.744224 |
| wapiti_scan | Wapiti | completed | 1 | 3 | 2026-07-16T10:34:52.757322 | 2026-07-16T10:34:59.448019 |

---

## 7. Scope

Testing was limited to assets recorded by the NoovaStack VAPT Platform for this scan.

### Approved Scope

| Asset ID | Type | Asset | Scope Status | Approval Status |
|---|---|---|---|---|
| 51c8599b-d822-4147-bcb2-d45844b362ce | url | http://192.168.220.209:3000/ | pending_review | pending |

### Tested Services

| Host | Port | Service | URL | HTTP Status | Server/Product | Version | Detected By |
|---|---:|---|---|---:|---|---|---|
| 192.168.220.209 | 3000 | http | http://192.168.220.209:3000/ | 307 | Not Provided | Not Provided | nmap |
| 192.168.220.209 | 8082 | http | http://192.168.220.209:8082/ | 502 | nginx | 1.31.3 | nmap |

### Out-of-Scope

| Item | Status |
|---|---|
| Authenticated testing | Not Provided |
| Source code review | Not Provided |
| Credential attacks | Not Provided |
| Denial-of-service testing | Not Performed |
| Destructive exploitation | Not Performed |

---

## 8. Assessment Methodology

The assessment methodology was based on the scan sessions and evidence recorded by the NoovaStack VAPT Platform.

| Step | Description |
|---:|---|
| 1 | Validated target reachability from the NoovaStack scanner network. |
| 2 | Performed TCP service discovery and lightweight service detection. |
| 3 | Collected HTTP response metadata and browser security header posture. |
| 4 | Ran Wapiti web vulnerability checks with bounded crawl depth and scan duration. |
| 5 | Normalized verified findings into OWASP, CWE, CVSS, and remediation fields. |

### Standards and References Used

| Standard | Usage |
|---|---|
| OWASP Web Security Testing Guide | Web assessment methodology reference |
| OWASP Top 10 2021 | Risk categorization and management reporting |
| CWE | Weakness mapping |
| CVSS-style severity scoring | Severity and remediation prioritization |

---

## 9. Assessment Limitations

| Limitation | Detail |
|---|---|
| Authentication Context | Not Provided |
| Source Code Access | Not Provided |
| Business Logic Testing | Not Provided |
| Exploitation Depth | No destructive exploitation, brute force, credential attacks, or denial-of-service testing was performed. |
| Coverage | Unauthenticated black-box checks can miss issues requiring valid user roles or source-code access. |
| Evidence Images | High-resolution evidence images were not provided by the platform data. |
| CVSS Vector Strings | Not Provided |
| Reviewer Notes | Not Provided |

---

## 10. Risk Rating Methodology

NoovaStack reported severities and CVSS-style scores for verified findings. Findings are ordered from Critical to Informational. The overall report risk is based on the highest verified severity and the concentration of findings observed during the assessment.

| Severity | General Meaning | Recommended Response |
|---|---|---|
| Critical | Severe exposure or active compromise risk | Immediate remediation |
| High | Significant exploitable risk | Urgent remediation |
| Medium | Security weakness with meaningful risk | Prioritized remediation |
| Low | Hardening issue or limited direct impact | Planned remediation |
| Informational | Exposure or observation requiring review | Review and track |

### Severity Summary Chart

```text
Critical       0 |
High           0 |
Medium         2 | ██
Low            4 | ████
Informational  1 | █
```

---

## 11. Summary of Findings

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 4 |
| Informational | 1 |
| Total | 7 |

| Finding ID | Title | Severity | CVSS | Status | Integrity | Tool |
|---|---|---|---:|---|---|---|
| 795ae46d-791c-4b53-b1c6-a14fb1ee0267 | Application Served Over Plain HTTP | Medium | 6.5 | confirmed | verified | safe_http_transport_check |
| 28cbfe02-061c-439d-9207-dd147ecd2189 | Missing Browser Security Headers | Medium | 5.3 | confirmed | verified | safe_http_header_check |
| 798d92a5-a7d1-4356-a58f-5f2efa19f3f5 | Framework Version Disclosure Header | Low | 3.1 | confirmed | verified | safe_http_header_check |
| ad2fa4fc-518c-42dd-adb9-cc7a79d402f9 | Wapiti: Content Security Policy Configuration | Low | 3.1 | confirmed | verified | wapiti |
| e419a6a1-f581-4b1c-95a6-1e9553265f78 | Wapiti: Clickjacking Protection | Low | 3.1 | confirmed | verified | wapiti |
| a8577a4e-3d78-49a6-808e-8c7625e04cba | Wapiti: MIME Type Confusion | Low | 3.1 | confirmed | verified | wapiti |
| e8803638-5fcc-4629-a7b0-2a4fc1600f99 | Open TCP Services Discovered | Informational | 0.0 | confirmed | verified | tcp_service_discovery |

---

## 12. Detailed Findings

### NS-F-001: Application Served Over Plain HTTP

| Field | Value |
|---|---|
| Finding ID | 795ae46d-791c-4b53-b1c6-a14fb1ee0267 |
| Finding Title | Application Served Over Plain HTTP |
| Severity | Medium |
| CVSS Score | 6.5 |
| CVSS Vector | Not Provided |
| OWASP Category | A02:2021 - Cryptographic Failures |
| CWE | CWE-319 |
| Affected Asset | http://192.168.220.209:3000/ |
| Endpoint | http://192.168.220.209:3000/ |
| HTTP Method | Not Provided |
| Finding Status | confirmed |
| Integrity Status | verified |
| Tool | safe_http_transport_check |
| Retest Status | Not Provided |

**Finding Summary**
The target is reachable over unencrypted HTTP.

**Business Impact**
Credentials, session cookies, and sensitive data can be exposed if users access the application without HTTPS.

**Technical Impact**
Network attackers may observe or modify unencrypted traffic between users and the application.

**Technical Description**
NoovaStack identified that the assessed web application is served over plain HTTP. Transport-layer encryption was not confirmed for the tested asset.

**Evidence**
The target URL recorded by NoovaStack is `http://192.168.220.209:3000/`.

**Steps to Reproduce**
Not Provided

**Immediate Mitigation**
Serve the application over HTTPS and redirect HTTP to HTTPS.

**Long-Term Remediation**
Serve the application over HTTPS, redirect HTTP to HTTPS, and enable HSTS after HTTPS is working correctly.

**Verification Steps**
Not Provided

**References**
OWASP Top 10 2021 A02: Cryptographic Failures; CWE-319.

---

### NS-F-002: Missing Browser Security Headers

| Field | Value |
|---|---|
| Finding ID | 28cbfe02-061c-439d-9207-dd147ecd2189 |
| Finding Title | Missing Browser Security Headers |
| Severity | Medium |
| CVSS Score | 5.3 |
| CVSS Vector | Not Provided |
| OWASP Category | A05:2021 - Security Misconfiguration |
| CWE | CWE-693 |
| Affected Asset | http://192.168.220.209:3000/ |
| Endpoint | http://192.168.220.209:3000/ |
| HTTP Method | Not Provided |
| Finding Status | confirmed |
| Integrity Status | verified |
| Tool | safe_http_header_check |
| Retest Status | Not Provided |

**Finding Summary**
The application response is missing browser security headers.

**Business Impact**
Missing browser security headers may increase exposure to clickjacking, content injection, MIME sniffing, and privacy leakage risks.

**Technical Impact**
Browsers may not enforce expected restrictions for framing, content execution, content type handling, referrer leakage, or permissions use.

**Technical Description**
NoovaStack safe HTTP checks identified that the application response is missing security headers that help browsers block common client-side attack techniques.

**Evidence**
NoovaStack reported missing browser security headers for `http://192.168.220.209:3000/`.

**Steps to Reproduce**
Not Provided

**Immediate Mitigation**
Add security headers appropriate to the application and test for compatibility.

**Long-Term Remediation**
Add a Content-Security-Policy, X-Frame-Options or frame-ancestors, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy suited to the application.

**Verification Steps**
Not Provided

**References**
OWASP Top 10 2021 A05: Security Misconfiguration; CWE-693.

---

### NS-F-003: Framework Version Disclosure Header

| Field | Value |
|---|---|
| Finding ID | 798d92a5-a7d1-4356-a58f-5f2efa19f3f5 |
| Finding Title | Framework Version Disclosure Header |
| Severity | Low |
| CVSS Score | 3.1 |
| CVSS Vector | Not Provided |
| OWASP Category | A05:2021 - Security Misconfiguration |
| CWE | CWE-200 |
| Affected Asset | http://192.168.220.209:3000/ |
| Endpoint | http://192.168.220.209:3000/ |
| HTTP Method | Not Provided |
| Finding Status | confirmed |
| Integrity Status | verified |
| Tool | safe_http_header_check |
| Retest Status | Not Provided |

**Finding Summary**
The application exposes the `X-Powered-By` header value: `Next.js`.

**Business Impact**
Technology disclosure can help attackers tailor reconnaissance and exploit selection.

**Technical Impact**
The application reveals implementation details that are not required by normal users.

**Technical Description**
NoovaStack identified a framework disclosure header in the application response.

**Evidence**
`X-Powered-By: Next.js`

**Steps to Reproduce**
Not Provided

**Immediate Mitigation**
Disable or remove the disclosure header.

**Long-Term Remediation**
Disable or remove the X-Powered-By header in the application server or framework configuration.

**Verification Steps**
Not Provided

**References**
OWASP Top 10 2021 A05: Security Misconfiguration; CWE-200.

---

### NS-F-004: Wapiti: Content Security Policy Configuration

| Field | Value |
|---|---|
| Finding ID | ad2fa4fc-518c-42dd-adb9-cc7a79d402f9 |
| Finding Title | Wapiti: Content Security Policy Configuration |
| Severity | Low |
| CVSS Score | 3.1 |
| CVSS Vector | Not Provided |
| OWASP Category | A05:2021 - Security Misconfiguration |
| CWE | CWE-200 |
| Affected Asset | http://192.168.220.209:3000/ |
| Endpoint | / |
| HTTP Method | Not Provided |
| Finding Status | confirmed |
| Integrity Status | verified |
| Tool | wapiti |
| Retest Status | Not Provided |

**Finding Summary**
Wapiti reported that Content Security Policy is not set.

**Business Impact**
Absence of CSP can increase exposure to client-side content injection and script execution risks.

**Technical Impact**
Browsers do not receive a CSP policy that constrains trusted content sources or script execution behavior.

**Technical Description**
Wapiti reported Content Security Policy Configuration at `/`. Parameter: `n/a`. Details: `CSP is not set`.

**Evidence**
Wapiti finding: `CSP is not set`.

**Steps to Reproduce**
Not Provided

**Immediate Mitigation**
Not Provided

**Long-Term Remediation**
Review the affected endpoint and apply the remediation recommended by Wapiti for this vulnerability class.

**Verification Steps**
Not Provided

**References**
OWASP Top 10 2021 A05: Security Misconfiguration; CWE-200.

---

### NS-F-005: Wapiti: Clickjacking Protection

| Field | Value |
|---|---|
| Finding ID | e419a6a1-f581-4b1c-95a6-1e9553265f78 |
| Finding Title | Wapiti: Clickjacking Protection |
| Severity | Low |
| CVSS Score | 3.1 |
| CVSS Vector | Not Provided |
| OWASP Category | A05:2021 - Security Misconfiguration |
| CWE | CWE-200 |
| Affected Asset | http://192.168.220.209:3000/ |
| Endpoint | / |
| HTTP Method | Not Provided |
| Finding Status | confirmed |
| Integrity Status | verified |
| Tool | wapiti |
| Retest Status | Not Provided |

**Finding Summary**
Wapiti reported that clickjacking protection is missing.

**Business Impact**
The application may be more susceptible to clickjacking-style user interface redress attacks.

**Technical Impact**
Browsers are not instructed to prevent the page from being framed by another site.

**Technical Description**
Wapiti reported Clickjacking Protection at `/`. Parameter: `n/a`. Details: `X-Frame-Options is not set`.

**Evidence**
Wapiti finding: `X-Frame-Options is not set`.

**Steps to Reproduce**
Not Provided

**Immediate Mitigation**
Not Provided

**Long-Term Remediation**
Review the affected endpoint and apply the remediation recommended by Wapiti for this vulnerability class.

**Verification Steps**
Not Provided

**References**
OWASP Top 10 2021 A05: Security Misconfiguration; CWE-200.

---

### NS-F-006: Wapiti: MIME Type Confusion

| Field | Value |
|---|---|
| Finding ID | a8577a4e-3d78-49a6-808e-8c7625e04cba |
| Finding Title | Wapiti: MIME Type Confusion |
| Severity | Low |
| CVSS Score | 3.1 |
| CVSS Vector | Not Provided |
| OWASP Category | A05:2021 - Security Misconfiguration |
| CWE | CWE-200 |
| Affected Asset | http://192.168.220.209:3000/ |
| Endpoint | / |
| HTTP Method | Not Provided |
| Finding Status | confirmed |
| Integrity Status | verified |
| Tool | wapiti |
| Retest Status | Not Provided |

**Finding Summary**
Wapiti reported that MIME type protection is missing.

**Business Impact**
Missing MIME type protection can increase exposure to browser content-sniffing behavior.

**Technical Impact**
Browsers may attempt to interpret content using sniffed MIME types instead of declared content types.

**Technical Description**
Wapiti reported MIME Type Confusion at `/`. Parameter: `n/a`. Details: `X-Content-Type-Options is not set`.

**Evidence**
Wapiti finding: `X-Content-Type-Options is not set`.

**Steps to Reproduce**
Not Provided

**Immediate Mitigation**
Not Provided

**Long-Term Remediation**
Review the affected endpoint and apply the remediation recommended by Wapiti for this vulnerability class.

**Verification Steps**
Not Provided

**References**
OWASP Top 10 2021 A05: Security Misconfiguration; CWE-200.

---

### NS-F-007: Open TCP Services Discovered

| Field | Value |
|---|---|
| Finding ID | e8803638-5fcc-4629-a7b0-2a4fc1600f99 |
| Finding Title | Open TCP Services Discovered |
| Severity | Informational |
| CVSS Score | 0.0 |
| CVSS Vector | Not Provided |
| OWASP Category | A05:2021 - Security Misconfiguration |
| CWE | CWE-200 |
| Affected Asset | http://192.168.220.209:3000/ |
| Endpoint | 192.168.220.209:3000, 192.168.220.209:8082 |
| HTTP Method | Not Provided |
| Finding Status | confirmed |
| Integrity Status | verified |
| Tool | tcp_service_discovery |
| Retest Status | Not Provided |

**Finding Summary**
NoovaStack discovered reachable TCP services: `3000/http`, `8082/http`.

**Business Impact**
Open services increase the externally reachable attack surface and should be reviewed for business necessity.

**Technical Impact**
Services available on the network may expose web applications, reverse proxies, or backend components.

**Technical Description**
NoovaStack identified open HTTP services using nmap-backed service discovery.

**Evidence**
`192.168.220.209:3000` returned HTTP status `307`. `192.168.220.209:8082` returned HTTP status `502` with `nginx/1.31.3` reported.

**Steps to Reproduce**
Not Provided

**Immediate Mitigation**
Review whether the exposed services are required.

**Long-Term Remediation**
Review exposed services and close ports that are not required for the application or testing scope.

**Verification Steps**
Not Provided

**References**
OWASP Top 10 2021 A05: Security Misconfiguration; CWE-200.

---

## 13. Remediation Roadmap

| Priority | Actions |
|---|---|
| High Priority | Serve the application over HTTPS, redirect HTTP to HTTPS, and enable HSTS after HTTPS is working correctly. |
| High Priority | Add a Content-Security-Policy, X-Frame-Options or frame-ancestors, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy suited to the application. |
| Planned Hardening | Disable or remove the X-Powered-By header in the application server or framework configuration. |
| Planned Hardening | Review the affected endpoint and apply the remediation recommended by Wapiti for this vulnerability class. |
| Review | Review exposed services and close ports that are not required for the application or testing scope. |

---

## 14. Retest Summary

| Field | Value |
|---|---|
| Retest Performed | Not Provided |
| Retest Date | Not Provided |
| Retest Scope | Not Provided |
| Retest Result | Not Provided |
| Retest Reviewer | Not Provided |

| Finding ID | Title | Original Severity | Retest Status |
|---|---|---|---|
| 795ae46d-791c-4b53-b1c6-a14fb1ee0267 | Application Served Over Plain HTTP | Medium | Not Provided |
| 28cbfe02-061c-439d-9207-dd147ecd2189 | Missing Browser Security Headers | Medium | Not Provided |
| 798d92a5-a7d1-4356-a58f-5f2efa19f3f5 | Framework Version Disclosure Header | Low | Not Provided |
| ad2fa4fc-518c-42dd-adb9-cc7a79d402f9 | Wapiti: Content Security Policy Configuration | Low | Not Provided |
| e419a6a1-f581-4b1c-95a6-1e9553265f78 | Wapiti: Clickjacking Protection | Low | Not Provided |
| a8577a4e-3d78-49a6-808e-8c7625e04cba | Wapiti: MIME Type Confusion | Low | Not Provided |
| e8803638-5fcc-4629-a7b0-2a4fc1600f99 | Open TCP Services Discovered | Informational | Not Provided |

---

## 15. Positive Security Observations

| Observation | Detail |
|---|---|
| Scan Completed Successfully | The NoovaStack scan completed with status `completed`. |
| Verified Findings Only | All included findings have integrity status `verified`. |
| Sensitive Values Omitted | The platform report note states that sensitive values are omitted by default. |
| Non-Destructive Assessment | No destructive exploitation, brute force, credential attacks, or denial-of-service testing was performed. |

---

## 16. Conclusion

The NoovaStack VAPT Platform completed a black-box website vulnerability assessment and penetration testing activity against the recorded target asset. The assessment identified seven verified findings, with the highest severity rated as Medium. The main remediation themes are transport security, browser security headers, technology disclosure reduction, and exposed service review.

The organization should remediate the Medium findings first, validate all browser security controls, review the necessity of open services, and perform a follow-up retest to confirm remediation effectiveness.

---

## 17. Affected Assets

| Asset ID | Asset | Finding IDs |
|---|---|---|
| 51c8599b-d822-4147-bcb2-d45844b362ce | http://192.168.220.209:3000/ | 795ae46d-791c-4b53-b1c6-a14fb1ee0267, 28cbfe02-061c-439d-9207-dd147ecd2189, 798d92a5-a7d1-4356-a58f-5f2efa19f3f5, ad2fa4fc-518c-42dd-adb9-cc7a79d402f9, e419a6a1-f581-4b1c-95a6-1e9553265f78, a8577a4e-3d78-49a6-808e-8c7625e04cba, e8803638-5fcc-4629-a7b0-2a4fc1600f99 |

---

## 18. Evidence Manifest

| Evidence Item | Source | Related Finding | Evidence Summary | Redaction Status |
|---|---|---|---|---|
| EVID-001 | NoovaStack safe HTTP checks | Application Served Over Plain HTTP | Target URL uses `http://192.168.220.209:3000/`. | No secrets present |
| EVID-002 | NoovaStack safe HTTP checks | Missing Browser Security Headers | Browser security headers reported missing. | No secrets present |
| EVID-003 | NoovaStack safe HTTP checks | Framework Version Disclosure Header | `X-Powered-By: Next.js`. | No secrets present |
| EVID-004 | Wapiti | Wapiti: Content Security Policy Configuration | `CSP is not set`. | No secrets present |
| EVID-005 | Wapiti | Wapiti: Clickjacking Protection | `X-Frame-Options is not set`. | No secrets present |
| EVID-006 | Wapiti | Wapiti: MIME Type Confusion | `X-Content-Type-Options is not set`. | No secrets present |
| EVID-007 | nmap / NoovaStack service discovery | Open TCP Services Discovered | `3000/http`, `8082/http`, nginx `1.31.3`, HTTP `502` on port `8082`. | No secrets present |
| Evidence Images | Not Provided | Not Provided | High-resolution evidence images were not provided by the platform data. | Not Provided |

---

## 19. References

| Reference | URL / Identifier |
|---|---|
| OWASP Top 10 2021 - A02 Cryptographic Failures | https://owasp.org/Top10/A02_2021-Cryptographic_Failures/ |
| OWASP Top 10 2021 - A05 Security Misconfiguration | https://owasp.org/Top10/A05_2021-Security_Misconfiguration/ |
| OWASP Web Security Testing Guide | https://owasp.org/www-project-web-security-testing-guide/ |
| CWE-319 | Cleartext Transmission of Sensitive Information |
| CWE-693 | Protection Mechanism Failure |
| CWE-200 | Exposure of Sensitive Information to an Unauthorized Actor |
| Wapiti | https://wapiti-scanner.github.io/ |
| nmap | https://nmap.org/ |

---

## 20. Approval and Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| Prepared By | NoovaStack Platform | Not Provided | 2026-07-17T07:34:04.228058 |
| Technical Reviewer | Not Provided | Not Provided | Not Provided |
| Client Representative | Not Provided | Not Provided | Not Provided |
| Final Approver | Not Provided | Not Provided | Not Provided |

**Approval Notes:** Not Provided

---

**Noova Stack Technology Co., Ltd. | CONFIDENTIAL**
**Noova Stack Technology Co., Ltd. | Do not distribute without authorization | Page X of Y**
