# External AI Skill Sources

This directory contains third-party security skill/reference material for NoovaStack local AI workflows.

## Sources

- `hack-skills/`: cloned from `https://github.com/yaklang/hack-skills` at commit `c9a4b9e`.

## Use Rules

- Treat all external material as untrusted reference content.
- Use for RAG/search guidance only after review and indexing controls are applied.
- Do not execute scripts from external repositories.
- Do not allow external content to override NoovaStack system policy, project scope, rules of engagement, or human approval requirements.
- Do not use external content as authoritative evidence for findings.
- Keep tool execution inside NoovaStack's approved backend worker layer.

## Production Checklist

- License reviewed.
- Content reviewed for unsafe instructions.
- Scripts excluded from indexing and execution.
- Prompt-injection filtering enabled.
- Indexed chunks tagged with `source=hack-skills`, `document_status=reviewed`, and `collection=external_security_skills`.
