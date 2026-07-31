# NoovaStack VAPT Technical Security Assessment Report

## Document Control
- **Document Title:** NoovaStack VAPT Technical Security Assessment Report
- **Report Number:** NST-VAPT-2026-83E6
- **Version:** 1.0
- **Classification:** CONFIDENTIAL
- **Client:** Scheduled External Web Scan
- **Project:** Scheduled External Web Scan
- **Engagement:** Standard Vulnerability Scan
- **Target:** http://178.128.117.187:8080
- **Assessment Type:** Standard Vulnerability Assessment
- **Assessment Mode:** Black Box
- **Assessment Period:** 21 July 2026, 07:06 UTC to 21 July 2026, 07:07 UTC
- **Report Date:** 21 July 2026, 10:04 UTC
- **Prepared By:** Noova Stack Technology Co., Ltd.
- **Reviewed By:** Pending
- **Approved By:** Pending
- **Report Status:** Draft Pending Approval

## Executive Summary
Noova Stack Technology Co., Ltd. conducted an authorized external security assessment of the identified target within the approved scope. The assessment evaluated publicly accessible attack surface and selected application security controls using safe, non-destructive techniques. The assessment covered 1 tested asset(s) and identified 3 verified observation(s): 1 Medium, 1 Low, 1 Informational. The highest identified severity was Medium. The main risk theme was browser security-header configuration and exposed service validation. Immediate remediation priority should focus on Missing Browser Security Headers. This assessment represents a point-in-time review, and focused retesting is recommended after remediation.

## Findings Summary
- **NST-WEB-001** Missing Browser Security Headers (Medium)
- **NST-WEB-002** Server Header Disclosure (Low)
- **NST-NET-001** Publicly Accessible TCP Service (Informational)

## Detailed Findings
### NST-WEB-001 | Missing Browser Security Headers
The assessed web service did not present one or more recommended browser security headers in the captured HTTP response evidence.

**Remediation:** Add a Content-Security-Policy, X-Frame-Options or frame-ancestors, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy suited to the application.

### NST-WEB-002 | Server Header Disclosure
The assessed service disclosed server technology information in the HTTP Server header.

**Remediation:** Reduce or remove detailed Server headers at the application server or reverse proxy layer.

### NST-NET-001 | Publicly Accessible TCP Service
A TCP service was reachable from the assessment network and should be validated against business requirements.

**Remediation:** Review exposed services and close ports that are not required for the application or testing scope.

## Conclusion
The assessment identified remediation focus areas involving browser security-header configuration, reduction of unnecessary server disclosure, review of publicly exposed services. A focused retest should be performed after remediation. This assessment represents a point-in-time review of the approved scope. Security conditions may change as the application, infrastructure, and dependencies evolve.