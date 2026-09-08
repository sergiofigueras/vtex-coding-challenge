# Delivery engine agent contract

Read `docs/sdd/manifest.json`, `docs/sdd/traceability.json`, the relevant infrastructure specifications, and `README.md` before changing the shared engine.

- Keep project-independent behavior in `engine/`; requirements and implementation for any deliverable belong in its `projects/<project-id>/` directory.
- Preserve explicit project selection, containment checks, OpenAI-only routing, conservative budgets, provider-usage accounting, and fail-closed reconciliation.
- Do not weaken the Harness sandbox, enable hidden model fan-out, use moving model aliases, or replace immutable price books in place.
- Preserve every prior byte of `cost/ledger.jsonl`; append corrections and new events only.
- Add offline tests for project-boundary, pricing, ledger, prompt, and configuration changes.
- Run `npm test`, the workspace `npm run dsh:config`, and the root `npm run check` before handoff.
