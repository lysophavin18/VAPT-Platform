# NoovaStack Local AI Agent Program

This package defines Phase 1 controls for adapting `qwen3-coder:30b-64k` inside NoovaStack VAPT without fine-tuning first.

## Operating Model

- Use one local model: `qwen3-coder:30b-64k`.
- Specialize agents with prompts, schemas, RAG filters, tool permissions, and evaluations.
- Keep execution, approval, redaction, scope, and audit controls outside the model.
- Fine-tuning is Phase 2 only after prompts, RAG, tools, and evaluations are stable.

## First Milestone

- Shared system policy: `prompts/shared_system_policy.md`
- Agent prompts: `prompts/*.md`
- Output schemas: `schemas/*.json`
- Agent mapping: `agents.yaml`
- RAG design: `rag/rag_collections.yaml`
- Evaluation suite: `evals/evaluation_plan.yaml`
- Dataset examples: `datasets/examples.jsonl`
- Model registry template: `registry/model_registry_template.yaml`

## Authorized Vulnerability Research Track

Use `offensive_security_training_plan.md` to tune the assistant for authorized vulnerability research without turning it into an autonomous exploit agent.

Key files:

- Training plan: `offensive_security_training_plan.md`
- Dataset examples: `datasets/authorized_vuln_research_examples.jsonl`
- Evaluation examples: `evals/authorized_vuln_research_eval.jsonl`
- Internal autonomous agent prompt: `prompts/internal_autonomous_assessment_agent.md`
- Internal autonomous action schema: `schemas/internal_autonomous_action_plan.json`
- Internal autonomous dataset: `datasets/internal_autonomous_agent_examples.jsonl`
- Internal autonomous evals: `evals/internal_autonomous_agent_eval.jsonl`
- Skill routing policy: `skill_routing.yaml`
- Skill routing examples: `datasets/skill_routing_examples.jsonl`

The model should learn to plan safe assessments, reason from evidence, reduce false positives, recommend remediation, and require human review for final decisions. Scanner execution must remain controlled by the NoovaStack backend and isolated workers.

## Safety Principle

RAG supplies current knowledge. Fine-tuning teaches consistent behavior. Tools supply verified platform data. Policies control every action. Evidence supports every finding. Humans approve final decisions.
