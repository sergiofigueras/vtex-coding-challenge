# Catalog consolidation agent contract

Read `project.json`, `docs/sdd/manifest.json`, `docs/sdd/traceability.json`, the requested specifications, their dependencies, and the `sdd-delivery` skill before editing.

- Implement only explicitly requested `ready` product specs. Dependencies marked context-only do not authorize unrelated implementation.
- Keep user requests, assessment requirements, process guidance, assumptions, and fixture observations separate.
- Never read, copy, commit, or quote the assessment PDFs. Never commit `.sdd/`, fixture files, databases, credentials, or generated transcripts.
- The catalog runtime must stay deterministic and model-free. OpenAI models are design-time engineering tools orchestrated by DeepSeek Harness.
- Preserve strict types, parameterized SQL, transactional safety, seller-scoped opaque IDs, and the deterministic identity decision in `SDD-004`.
- Use the smallest useful context. Prefer local deterministic inspection and tests over model calls.
- Run narrow tests while iterating, then `npm run check`. Update spec status and evidence only after the criterion is proved.
- Do not commit, push, rewrite history, or modify prior cost-ledger lines. Report changed paths, proof commands, open decisions, and the active change ID to the outer operator.
