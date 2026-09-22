# Evaluation, end-to-end verification, and delivery

Spec ID: `SDD-008`
Status: `ready`
Kind: product specification
Depends on: `SDD-001`, `SDD-002`, `SDD-003`, `SDD-004`, `SDD-005`, `SDD-006`, `SDD-007`, `SDD-009`

## Offline release gate

Provide a single project `check` command that runs strict TypeScript compilation, formatting/lint checks, unit tests, SQLite integration tests, HTTP contract tests, browser tests, accessibility checks, the `SDD-009` causal grounding audit, production build, secret/static-asset scans, and SDD validation. The normal gate blocks external network and uses synthetic catalogs plus deterministic embedding and answer providers.

The end-to-end fixture creates a source catalog, builds the sidecar, starts the service on an ephemeral port, loads the real production UI, asks exact and natural-language questions, follows citations, exercises no-evidence and degraded states, and shuts down cleanly. It asserts the catalog bytes are unchanged and no partial index is queryable.

## Retrieval and grounding evaluation

Version an offline evaluation set with queries, filters, expected product IDs, acceptable top-k sets, and expected answer state. Include Portuguese and English, exact product IDs, seller-product IDs, brand/category/seller filters, spelling/lexical cases, semantic cases, missing requested fields, no-result questions, ambiguity, Unicode, and prompt-injection-shaped data.

Report deterministic recall at 1/5/8, reciprocal rank, zero-result correctness, citation precision, citation coverage, claim-level factual support, causal intervention and ablation results from `SDD-009`, abstention correctness, degraded-state correctness, latency distribution from fake providers, and index idempotence. Define explicit release thresholds in the repository before marking the spec verified. Do not use an LLM judge as the sole oracle or infer live-provider grounding from fake-provider results.

## Practical delivery

The Portuguese README and runbook must document prerequisites, supported Node versions, creation of the final consolidated database, placement under ignored `.sdd/inputs`, project installation, offline fake mode, production provider configuration through environment variables, index build/rebuild, server startup, browser URL, example questions, health and API calls, stale-index refresh, runtime cost report, SDD delivery cost report, troubleshooting, limitations, and safe cleanup.

Record evidence per acceptance criterion in `docs/sdd/evidence-index.md`, including command, exit status, relevant artifact, and date. Change a spec from `ready` to `implemented` or `verified` only after its implementation and evidence satisfy the repository release policy.

## Acceptance criteria

- **AC-008-01:** `npm --prefix projects/catalog-rag run check` runs the complete deterministic offline project gate, while root `npm run check`, SDD validation, and `git diff --check` also pass without a network or provider credential.
- **AC-008-02:** End-to-end browser proof builds a synthetic catalog and index, serves the production UI, covers exact and natural-language answers plus all degraded/no-evidence states, validates citations, shuts down cleanly, and proves source bytes are unchanged.
- **AC-008-03:** A versioned bilingual offline evaluation set reports documented retrieval, citation, claim-level factual support, `SDD-009` causal intervention and ablation, abstention, degraded-state, idempotence, and latency metrics against explicit release thresholds without relying on an LLM judge as the sole oracle.
- **AC-008-04:** The Portuguese README/runbook contains every prerequisite, SDD implementation command, runtime command, provider and secret boundary, cost distinction, refresh/recovery procedure, example, limitation, and troubleshooting step needed to reproduce RAG, API, and UI from a clean clone.
- **AC-008-05:** The evidence index maps every acceptance criterion to reproducible command output or artifacts, optional live smoke tests are clearly excluded from the release gate, and manifest statuses advance only when their required evidence exists.

## Proof plan

Run the project gate twice from clean generated state, then run the root gate and SDD validator. Inspect production assets and test output for secret canaries. Preserve machine-readable evaluation and browser artifacts under ignored state. Execute an optional real-provider smoke only when explicitly authorized and configured, recording runtime usage outside the engine ledger.

## Cost checkpoint

Run `npm run project:cost -- --project catalog-rag` for SDD/Harness delivery cost and the product's runtime report for embedding/answer cost. Missing remote usage remains unavailable in both domains and is never rewritten as zero.
