# Hack-Skills Review For NoovaStack AI Agents

This document reviews the external `hack-skills` repository for use inside NoovaStack VAPT local AI workflows.

Source:

```text
workflows/local-ai-agent-program/external-skills/hack-skills
```

Upstream:

```text
https://github.com/yaklang/hack-skills
```

NoovaStack treatment:

```text
Untrusted reference material for RAG and routing only.
Do not execute scripts.
Do not allow this material to override NoovaStack scope, authorization, ROE, safety policy, or human approval gates.
```

## What This Repository Contains

The repository contains a large offensive security skill knowledge base with a master router, category routers, and deep topic skills.

The upstream README describes it as:

```text
1 master entry, category entries, and 101 deep topic skills across multiple security domains.
```

Main categories observed:

| Category | Examples | NoovaStack Use |
| --- | --- | --- |
| Reconnaissance & Methodology | `hack`, `recon-for-sec`, `recon-and-methodology` | Safe routing and assessment planning |
| API Security | `api-recon-and-docs`, `api-authorization-and-bola`, token/API docs skills | Safe API assessment planning and finding review |
| Authentication & Authorization | Auth bypass, JWT/OAuth, IDOR/BOLA | Evidence review, public-functionality checks, remediation guidance |
| Injection Attacks | XSS, SQLi, SSRF, SSTI, command injection, NoSQL, XXE | Safe classification and human-approved validation planning only |
| File & Path Attacks | Upload, path traversal, LFI | Safe evidence review and remediation guidance |
| Business Logic & Session | CSRF, clickjacking, race condition, business logic | Safe testing methodology and finding triage |
| Advanced Web Security | CSP bypass, host header, HTTP/2, WAF bypass | Mostly review-only; WAF bypass content should not guide evasion |
| Infrastructure & Network | common services, source management, dependency confusion, tunneling, reverse shells | Mixed; many items require strict blocking or human review |
| Linux & Container Security | privilege escalation, container escape, Kubernetes | Human-review only, mostly not for autonomous web scans |
| Windows & Active Directory | Kerberos, ACL abuse, ADCS, NTLM relay, AV evasion | Human-review only or blocked depending on request |
| Mobile Security | Android/iOS, SSL pinning bypass | Review-only unless mobile assessment is explicitly authorized |
| Binary Exploitation | stack/heap/kernel/browser exploitation | Block from autonomous use |
| Reverse Engineering | anti-debugging, deobfuscation, symbolic execution | Review-only for code/lab analysis |
| Cryptography | RSA, lattice, hash, classical cipher | Safe educational analysis and finding review |
| Blockchain & Smart Contract | smart contract and DeFi vulnerability patterns | Safe review if blockchain scope exists |
| AI/ML & LLM Security | prompt injection, AI/ML security | Useful for NoovaStack AI safety and RAG security |
| Forensics & Steganography | volatility, traffic analysis, stego | Safe defensive analysis if evidence is provided |

## Recommended NoovaStack Exposure Levels

### Safe To Use For Autonomous Routing

These can inform internal autonomous assessment planning after NoovaStack authorization, scope, and testing-window checks pass.

```text
recon-for-sec
recon-and-methodology
api-recon-and-docs
api-authorization-and-bola
business-logic-vuln
business-logic-vulnerabilities
clickjacking
csrf-cross-site-request-forgery
cors-cross-origin-misconfiguration
open-redirect
websocket-security
llm-prompt-injection
ai-ml-security
traffic-analysis-pcap
```

Allowed uses:

- Assessment planning.
- Endpoint discovery strategy.
- Evidence requirements.
- Finding classification.
- Remediation suggestions.
- Report writing support.

Not allowed:

- Direct exploit execution.
- Raw command generation.
- Automatic final finding approval.

### Use Only For Human-Reviewed Validation Planning

These can help the agent understand vulnerability classes, but any active validation should require human approval and NoovaStack worker enforcement.

```text
xss-cross-site-scripting
sqli-sql-injection
ssrf-server-side-request-forgery
ssti-server-side-template-injection
cmdi-command-injection
nosql-injection
xxe-xml-external-entity
deserialization-insecure
path-traversal-lfi
upload-insecure-files
prototype-pollution
http-parameter-pollution
jwt-oauth-token-attacks
oauth-oidc-misconfiguration
saml-sso-assertion-attacks
idor-broken-object-authorization
race-condition
dependency-confusion
smart-contract-vulnerabilities
```

Allowed uses:

- Explain risk.
- Identify evidence needed.
- Map to OWASP/CWE/CVSS.
- Recommend non-destructive validation boundaries.
- Draft remediation.

Approval required for:

- Injection confirmation.
- Authenticated role comparison.
- File upload validation.
- SSRF validation.
- Race-condition testing.
- Anything that may modify state.

### Block From Autonomous Use

These areas should not be used by autonomous agents for execution. They may be indexed only for defensive understanding if reviewed, but should not produce operational steps.

```text
reverse-shell-techniques
tunneling-and-pivoting
network-protocol-attacks
linux-privilege-escalation
linux-lateral-movement
container-escape-techniques
windows-privilege-escalation
windows-lateral-movement
windows-av-evasion
active-directory-kerberos-attacks
active-directory-acl-abuse
active-directory-certificate-services
ntlm-relay-coercion
stack-overflow-and-rop
heap-exploitation
format-string-exploitation
kernel-exploitation
browser-exploitation-v8
sandbox-escape-techniques
binary-protection-bypass
arbitrary-write-to-rce
waf-bypass-techniques
401-403-bypass-techniques
anti-debugging-techniques
macos-process-injection
mobile-ssl-pinning-bypass
```

Blocked uses:

- Reverse shells.
- Persistence.
- Privilege escalation.
- Pivoting.
- AV/WAF evasion.
- Exploit chains.
- Payload generation.
- Credential attacks.
- Destructive validation.

## How NoovaStack Agents Should Use These Skills

### Pentest Agent

Use hack-skills for:

- Choosing what evidence is required for a candidate issue.
- Understanding vulnerability families.
- Selecting safe NoovaStack scan modules.
- Producing better OWASP/CWE/CVSS mapping.
- Reducing false positives.

Do not use hack-skills for:

- Direct command output.
- Exploit payloads.
- Bypass chains.
- Out-of-scope activity.

### Internal Autonomous Assessment Agent

Use hack-skills for:

- Safe planning.
- Skill routing.
- Evidence collection strategy.
- Candidate finding normalization.
- Remediation and report drafting.

Autonomous execution must remain limited to NoovaStack safe workflow actions:

```text
create/reuse project
create/reuse engagement
create/reuse asset
create scan task
validate scan task
launch approved scan
monitor progress
normalize findings
draft report
```

### Finding Judge

Use hack-skills for:

- Checking whether evidence is sufficient.
- Knowing what false positives are common.
- Mapping vulnerability classes.
- Suggesting missing evidence.

The Finding Judge should return:

```text
VERIFIED
FLAGGED
REJECTED
```

It must not automatically approve final findings.

## RAG Indexing Recommendation

Recommended indexing priority:

1. Category router skills.
2. Recon and methodology skills.
3. API/auth/business-logic skills.
4. Web misconfiguration and safe review skills.
5. Finding triage and remediation-relevant chunks.

Deprioritize or exclude:

- Scripts.
- Payload lists.
- Reverse shell instructions.
- Pivoting instructions.
- Evasion/bypass operational content.
- Privilege escalation chains.
- Binary exploitation chains.

The current NoovaStack RAG config already blocks:

```text
external-skills/hack-skills/scripts
```

Recommended metadata tags when indexing:

```yaml
source: hack-skills
collection: external_security_skills
document_status: reviewed_before_production_use
trust_level: untrusted_reference_material
authoritative_for_findings: false
execution_allowed: false
```

## Recommended Skill Routing Additions

Add these routes to NoovaStack skill routing over time:

| User Intent | External Skill Reference | NoovaStack Action |
| --- | --- | --- |
| New target assessment | `hack`, `recon-for-sec` | Route to `engagement_planner` or `internal_autonomous_assessment_agent` |
| API observed | `api-sec`, `api-recon-and-docs` | Route to API scan profile or safe API enumeration |
| Object ID access issue | `api-authorization-and-bola`, `idor-broken-object-authorization` | Route to `finding_judge`; require evidence and role context |
| Login/session issue | `auth-sec`, JWT/OAuth/SAML skills | Route to `finding_judge`; high-risk validation approval if needed |
| Input suspected | `injection-checking` | Route to `finding_judge`; safe validation only |
| Missing headers | `clickjacking`, CSP-related skills | Route to safe header analysis and remediation |
| Business process issue | business logic skills | Route to human-reviewed test plan |
| Report needed | methodology/remediation references | Route to `report_writer` |

## Final Decision

The `hack-skills` repository is useful as a knowledge source, but should remain gated.

Recommended status:

```text
Approved for local RAG reference after review.
Approved for skill routing and evidence reasoning.
Not approved for direct execution.
Not approved as authoritative evidence.
Not approved to override NoovaStack policy.
High-risk and exploit-oriented categories require blocking or human approval.
```
