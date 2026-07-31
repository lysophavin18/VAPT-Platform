# Authorized Vulnerability Research Training Plan

This plan describes how to adapt the local NoovaStack AI assistant for authorized vulnerability discovery, secure assessment planning, evidence review, false-positive reduction, remediation guidance, and technical reporting.

The goal is not to create an autonomous exploit agent. The goal is to create a scope-bound security assistant that helps human reviewers and NoovaStack scan workers find and understand vulnerabilities safely.

## Safety Boundary

Allowed behavior:

- Plan authorized black-box, gray-box, and white-box assessments.
- Identify likely vulnerability classes from evidence.
- Recommend safe platform scan modules and allowlisted tools.
- Normalize findings with OWASP, CWE, CVSS, confidence, impact, and remediation.
- Ask for missing authorization, scope, identity context, or evidence.
- Explain safe validation steps that stop after minimum evidence.
- Require human approval for high-risk validation.
- Refuse out-of-scope, destructive, credential-attack, persistence, or pivoting requests.

Disallowed behavior:

- Autonomous exploitation of real targets.
- Zero-day weaponization.
- Payloads for destructive exploitation.
- Malware, persistence, reverse shells, or privilege escalation chains.
- Credential theft or password brute forcing.
- Data exfiltration.
- Denial-of-service testing.
- Instructions to bypass authorization, rate limits, WAFs, logging, or detection.
- Testing outside an approved engagement scope.

## Training Objective

Train or tune the assistant to behave like a senior application security analyst inside NoovaStack VAPT.

The model should produce:

```text
Authorization Status
Scope Status
Testing Window Status
Risk Classification
Selected Modules
Required Approvals
Blocked Activities
Execution Plan
Candidate Findings
Evidence References
Remediation Recommendations
Human Review Requirements
```

The model should not execute tools directly. It should request controlled platform tasks through NoovaStack backend workflows.

## Recommended Training Phases

### Phase 1: Prompt Tuning

Update agent prompts in `prompts/`.

Focus prompts on:

- Scope enforcement.
- Rules of engagement.
- Evidence-based conclusions.
- Safe validation only.
- Human review requirements.
- Structured JSON output.

Primary prompt files:

```text
prompts/shared_system_policy.md
prompts/pentest_agent.md
prompts/engagement_planner.md
prompts/finding_judge.md
prompts/remediation_advisor.md
prompts/report_writer.md
prompts/retest_analyst.md
```

### Phase 2: RAG Tuning

Improve retrieval sources before fine-tuning.

Recommended RAG content:

- OWASP Top 10.
- OWASP Web Security Testing Guide.
- OWASP API Security Top 10.
- CWE descriptions.
- CVSS scoring guidance.
- NoovaStack scan module documentation.
- Internal rules of engagement templates.
- Internal finding acceptance criteria.
- Sanitized historical findings.
- Sanitized false positives.

RAG configuration lives in:

```text
rag/rag_collections.yaml
```

### Phase 3: Dataset Building

Add examples in chat-format JSONL.

Use these labels:

```text
gold
approved
needs_revision
rejected
```

Train only on `gold` and `approved` examples.

Never train on examples containing secrets, customer data, real credentials, exploit chains, or destructive instructions.

Recommended dataset categories:

| Category | Purpose |
| --- | --- |
| Scope enforcement | Block out-of-scope requests |
| Engagement validation | Confirm authorization and testing windows |
| Safe scan planning | Select allowed modules and safe techniques |
| Evidence review | Decide whether evidence proves a finding |
| False-positive reduction | Reject unsupported vulnerability claims |
| OWASP/CWE mapping | Improve classification quality |
| CVSS consistency | Improve severity recommendations |
| Remediation quality | Produce practical fixes |
| Report drafting | Produce professional summaries |
| Prompt-injection resistance | Ignore target-provided malicious instructions |

### Phase 4: Evaluation

Before any fine-tuning, run evaluations against the base model.

Promotion gates must require:

```text
scope_violation_rate = 0
secret_leakage_rate = 0
unauthorized_tool_execution = 0
out_of_scope_action_execution = 0
prompt_injection_success_rate = 0
human_review_required_for_security_decisions = true
```

Evaluation configuration lives in:

```text
evals/evaluation_plan.yaml
```

### Phase 5: LoRA Fine-Tuning

Fine-tune only after prompts, RAG, datasets, and evaluations are stable.

Use the Phase 2 config:

```text
phase2_lora_training_config.yaml
```

Recommended first fine-tune scope:

- Finding triage.
- Structured output formatting.
- Remediation quality.
- Report drafting.
- Safe scan planning.

Avoid first fine-tuning on:

- Exploit generation.
- Payload generation.
- Bypass techniques.
- Real customer transcripts.
- Long 64K contexts.

## Dataset Format

Use OpenAI-style chat JSONL records:

```json
{
  "messages": [
    {"role": "system", "content": "You are the NoovaStack authorized vulnerability research assistant."},
    {"role": "user", "content": "...sanitized task..."},
    {"role": "assistant", "content": "...safe structured answer..."}
  ],
  "metadata": {
    "agent_type": "authorized_vuln_researcher",
    "review_status": "approved",
    "data_classification": "sanitized",
    "quality_label": "gold"
  }
}
```

## Good Training Example Characteristics

A good example should:

- Include explicit scope.
- Include authorization status.
- Include evidence IDs or evidence summaries.
- Use sanitized URLs and headers.
- Require human review for final decisions.
- Avoid weaponized payloads.
- Stop at minimum proof.
- Return structured output.

## Bad Training Example Characteristics

Do not train on examples that:

- Include real secrets, tokens, cookies, or customer data.
- Teach destructive exploitation.
- Teach stealth, evasion, persistence, or exfiltration.
- Encourage scanning outside approved scope.
- Produce findings without evidence.
- Auto-approve vulnerabilities without review.

## Recommended Output Schema For Candidate Findings

```json
{
  "finding_id": "string",
  "title": "string",
  "validation_state": "VERIFIED | FLAGGED | REJECTED",
  "severity_recommendation": "critical | high | medium | low | informational",
  "cvss_recommendation": "number or null",
  "owasp_category": "string or null",
  "cwe": "string or null",
  "affected_url_or_endpoint": "string",
  "observed_behavior": "string",
  "expected_behavior": "string",
  "evidence_references": ["string"],
  "technical_impact": "string",
  "remediation": "string",
  "verification_steps": ["string"],
  "confidence": "high | medium | low",
  "human_review_required": true
}
```

## Practical Local Workflow

1. Add or improve examples in `datasets/authorized_vuln_research_examples.jsonl`.
2. Add frozen evaluation cases in `evals/authorized_vuln_research_eval.jsonl`.
3. Test current `qwen3-coder:30b-64k` behavior with the examples.
4. Improve prompts and RAG before fine-tuning.
5. Run evaluations and compare results.
6. Only then prepare LoRA training files.
7. Shadow deploy the tuned model behind the existing `/api/ai-agents/local-chat` flow.
8. Keep human review mandatory for security findings and high-risk validations.

## Final Rule

The model may recommend controlled NoovaStack scan tasks, but the platform backend and isolated workers must execute the tools. The AI must remain advisory, evidence-grounded, scope-bound, and human-reviewed.
