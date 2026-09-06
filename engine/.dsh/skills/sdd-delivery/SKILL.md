---
name: sdd-delivery
description: Implement a bounded set of repository SDD specifications with traceable evidence and cost-aware OpenAI model use.
---

# SDD delivery

## Preconditions

1. Read `project.json`, `AGENTS.md`, `docs/sdd/manifest.json`, and `docs/sdd/traceability.json` in the selected project.
2. Extract the active change ID and the specs marked `(IMPLEMENT)` from the task prompt.
3. Read every listed spec in order. Dependencies marked `(CONTEXT ONLY)` constrain the work but do not expand it.
4. Stop and report a scope conflict if an acceptance criterion cannot be satisfied without an unrequested spec.

## Delivery loop

For each requested spec:

1. Restate its acceptance IDs and identify the smallest coherent implementation slice.
2. Inspect only the code and tests needed for that slice.
3. Implement production code and executable evidence together. Keep the product runtime deterministic and model-free.
4. Run the narrowest relevant check; repair before expanding the test surface.
5. Run `npm run check` once the slice is coherent.
6. Change `ready` to `implemented` only when code exists, and to `verified` only when every acceptance ID has reproducible evidence. Add the evidence index required by `SDD-007`; never claim fixture proof without running it.

## Cost behavior

The outer runner owns accounting and budgets. Minimize model cost by reusing read context, summarizing findings once, preferring deterministic commands, and avoiding repeated broad scans. The default Terra route is sufficient for normal implementation. Do not request Sol or long context from inside a run. Report any genuine need for escalation to the operator with the acceptance ID, reason, and failed evidence.

## Safety and handoff

Do not access environment secrets, source PDFs, ignored fixtures except through documented test commands, or paths outside the selected project. Do not commit or push. The outer engine owns the cost ledger. End with:

- change ID and requested specs;
- files changed;
- acceptance evidence and exact commands;
- remaining risks or decisions;
- whether the complete gate passed.
