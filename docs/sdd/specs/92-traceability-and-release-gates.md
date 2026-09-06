# Traceability and release gates

Spec ID: `SDD-092`
Status: `verified`
Kind: infrastructure specification
Depends on: `SDD-090`, `SDD-091`

## Traceability contract

`docs/sdd/manifest.json` is the spec index and dependency graph. `docs/sdd/traceability.json` is the requirement ledger; every requirement declares whether it came from the user, assessment, process guidance, or fixture observation. Ownership is reciprocal: every referenced requirement appears on the owning specs and every spec path/acceptance ID exists in its Markdown.

Product specs begin `ready`; they move to `implemented` only with code and tests, and to `verified` only when acceptance evidence is indexed. Infrastructure specs may be `verified` in this initial scaffold because their executable validators and tests are present. One change may implement only explicitly requested specs, though dependencies are provided as context.

## Change and release gates

Every non-merge commit has a `Cost-Entry: <change-id>` trailer referring to at least one hash-valid ledger record. Model-free, human, and external-agent changes still receive an unavailable or zero-cost entry with honest provenance. The validator checks source hashes, spec graph, reciprocal traceability, priceability of configured models, budget ordering, the ledger chain, trailers, and credential patterns.

CI uses the pinned lockfile and supported Node runtime, runs the Harness configuration smoke test without a provider key, then runs SDD validation and tests. It does not download confidential PDFs, run a live model, or require secrets. Release additionally requires source ingestion, clean tracked-file inspection, cost report review, and product evidence once the product specs are implemented.

## Delivery sequence

Implement future work in dependency-sized changes:

1. `SDD-001` and `SDD-002` — package boundary, CLI contract, and safe input.
2. `SDD-003` — migrations and repository invariants.
3. `SDD-004` — canonical identity and reviewed aliases.
4. `SDD-005` and `SDD-006` — atomic consolidation, errors, and security.
5. `SDD-007` — complete verification and fixture evidence.
6. `SDD-008` — final delivery, clean-room run, and engineering defense.

Use a distinct change ID and ledger record for each numbered step. Do not mark later specs verified simply because earlier tests pass.

## Acceptance criteria

- **AC-092-01:** Manifest dependencies are acyclic, every requirement owner is reciprocal, and every acceptance criterion appears exactly in its declared spec.
- **AC-092-02:** Every non-merge commit references an existing hash-valid cost entry through a `Cost-Entry` trailer.
- **AC-092-03:** CI performs an offline Harness config smoke, SDD validation, tests, secret scan, and tracked-artifact policy check without a model key.
- **AC-092-04:** The documented delivery sequence preserves spec scope, requires evidence before status changes, and finishes with a clean-clone release gate and cost report.

## Proof

Run `npm run check`, `npm run dsh:config`, `npm run cost:report`, and inspect the GitHub Actions result for the final revision. Future product delivery must also complete the source/fixture gate described in `SDD-007`.

## Cost checkpoint

CI and release validation are model-free. Any agent repair after a failed gate is a new attempt attributed to the same active change until that change closes.
