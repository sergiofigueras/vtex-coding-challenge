# Traceability and release gates

Spec ID: `SDD-092`
Status: `verified`
Kind: infrastructure specification
Depends on: `SDD-090`, `SDD-091`

## Traceability contract

Each project descriptor names its spec index and dependency graph plus its requirement ledger; `engine/docs/sdd/` owns the engine's own infrastructure graph. Every requirement declares its authority. Ownership is reciprocal: every referenced requirement appears on the owning specs and every spec path/acceptance ID exists in its Markdown.

Product specs begin `ready`; they move to `implemented` only with code and tests, and to `verified` only when acceptance evidence is indexed. Infrastructure specs may be `verified` because their executable validators and tests are present. One change may implement only explicitly requested specs, though dependencies are provided as context.

## Change and release gates

Every non-merge commit has a `Cost-Entry: <change-id>` trailer referring to at least one hash-valid engine-ledger record. New records also identify the project they affect. Model-free, human, and external-agent changes still receive an unavailable or zero-cost entry with honest provenance. The validator checks every registered project descriptor, source hashes, spec graphs, reciprocal traceability, priceability of configured models, budget ordering, the ledger chain, trailers, and credential patterns.

CI uses the pinned workspace lockfile and supported Node runtime, runs the Harness configuration smoke test without a provider key, validates the engine and every registered project, then runs tests. It does not download confidential PDFs, run a live model, or require secrets. Release additionally requires project source ingestion, clean tracked-file inspection, cost report review, and product evidence once the selected project's specs are implemented.

## Delivery sequence

For any selected project, implement future work in dependency-sized changes:

1. Register requirements with explicit authority and reciprocal spec ownership.
2. Request the smallest coherent ready-spec slice with one change ID.
3. Prepare and review the dependency closure before making a model call.
4. Implement and test only the requested slice, then settle its cost.
5. Run project and workspace gates before the outer operator commits.
6. Repeat until the project's own final-delivery spec and clean-run evidence are complete.

Use a distinct change ID and project-attributed ledger record for each slice. Do not mark later specs verified simply because earlier tests pass.

## Acceptance criteria

- **AC-092-01:** Manifest dependencies are acyclic, every requirement owner is reciprocal, and every acceptance criterion appears exactly in its declared spec.
- **AC-092-02:** Every non-merge commit references an existing hash-valid cost entry through a `Cost-Entry` trailer.
- **AC-092-03:** CI performs an offline Harness config smoke, SDD validation, tests, secret scan, and tracked-artifact policy check without a model key.
- **AC-092-04:** The project-independent delivery sequence preserves spec scope, requires evidence before status changes, and finishes with a clean-clone release gate and cost report.

## Proof

Run `npm run check`, `npm run dsh:config`, `npm run cost:report`, and inspect the GitHub Actions result for the final revision. Future product delivery must also complete the selected project's source/fixture gate.

## Cost checkpoint

CI and release validation are model-free. Any agent repair after a failed gate is a new attempt attributed to the same active change until that change closes.
