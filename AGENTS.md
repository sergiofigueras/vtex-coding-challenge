# Workspace agent contract

This repository separates the reusable delivery control plane in `engine/` from independently specified deliverables in `projects/<project-id>/`.

- Read the selected project's `project.json`, `AGENTS.md`, SDD manifest, traceability ledger, requested specs, and dependencies before editing it.
- Never mix requirements, ADRs, source manifests, or application code between projects.
- Treat `engine/` as shared infrastructure. A product request does not authorize engine changes.
- Never rewrite prior bytes in `engine/cost/ledger.jsonl`. Every new event must preserve its hash chain and identify its project when known.
- Never commit `.sdd/`, credentials, private inputs, generated sessions, transcripts, databases, or source PDFs.
- Use deterministic inspection and tests before model calls. OpenAI is the only model provider and is invoked through pinned DeepSeek Harness routes.
- Run narrow checks while iterating, then the selected project check and root `npm run check`.
- Inner Harness agents do not commit or push. They report changed paths, acceptance evidence, remaining decisions, and the active change ID to the outer operator.
