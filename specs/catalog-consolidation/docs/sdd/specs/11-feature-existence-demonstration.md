# Executable feature-existence demonstration

Spec ID: `SDD-011`
Status: `ready`
Kind: product specification
Depends on: `SDD-010`

## Authority and intent

The user requires a repeatable demonstration that the catalog-consolidation feature exists and works. A generated prompt, a successful build, or prose documentation is not sufficient evidence. The demonstration must execute the public application against a disposable, deterministic scenario and assert the resulting catalog state.

This specification adds demonstration and evidence surfaces only. It does not change the product-identity policy, input contract, transaction semantics, operational limits, or any reviewed behavior owned by `SDD-001` through `SDD-010`.

## Demonstration contract

Provide one documented project command, `npm run demo:feature`, that a reviewer can run after `npm ci`. The command must build the application as needed, create all demonstration inputs in a temporary directory, execute the public CLI, check the database through the exact `Product` and `SellerProduct` table names, and exit successfully only after every assertion passes.

The demonstration must be public and self-contained. It must not download or copy the private assessment fixtures, read `.sdd/inputs`, require credentials, call a model or network service, or mutate a repository database. Synthetic data must include:

- an existing catalog product offered by two different sellers, proving that the existing `Product` row is reused and both seller links are created;
- one distinct incoming product, proving that a new `Product` row and its seller link are created;
- harmless normalization variation covered by the existing deterministic identity policy, without introducing a new alias or matching rule.

The expected first committed run therefore has an exact delta of one `Product` row and three `SellerProduct` rows. A dry run over the same starting database must report the same planned delta while preserving the database bytes. A second committed run over the already updated database must report zero created products and zero created seller links, with unchanged final table counts.

## Evidence and output

The demonstration must retain the CLI's versioned JSON summary as the behavioral interface under test. Assertions must fail closed on a non-zero child exit, malformed or unexpected output, an incorrect row delta, a missing seller link, a changed dry-run database, or a non-idempotent replay. Expected counts must be derived from the synthetic scenario and checked directly; success must not be inferred from matching log text alone.

Normal success cleans up temporary files. On failure, the command must identify the failed phase and may preserve or report the temporary directory for local diagnosis, but it must not print product payloads, database contents, credentials, environment values, or unredacted source paths.

Add a focused automated test for the command or its reusable demonstration module. Map every criterion below to executable evidence in `docs/sdd/evidence-index.md`; do not mark this specification `verified` from a manual observation alone.

## Out of scope

- Replacing or weakening the private-fixture test in `SDD-007`.
- Claiming that the synthetic scenario proves production scale or every assessment fixture edge case.
- Changing canonical identity, schema, migration, validation, error, or limit behavior.
- Adding a runtime LLM, network dependency, committed database, or committed generated input.

## Acceptance criteria

- **AC-011-01:** `npm run demo:feature` is a documented, deterministic, self-contained command that builds as needed, creates only disposable synthetic inputs, requires no credential/network/private fixture, and returns zero only when the complete demonstration passes.
- **AC-011-02:** The dry-run phase plans exactly one new product and three new seller links, leaves the starting database byte-for-byte unchanged, and proves that two sellers resolve to the same existing product while one distinct product remains separate.
- **AC-011-03:** The first committed phase creates exactly one `Product` row and three `SellerProduct` rows; direct assertions against the exact table names prove the expected seller-to-product relationships without exposing row contents in shared output.
- **AC-011-04:** An identical committed replay creates zero products and zero seller links, preserves final table counts, and any non-zero child exit, malformed summary, mismatched count, missing link, dry-run mutation, or replay mutation makes the demonstration fail.
- **AC-011-05:** Focused automated evidence, `docs/sdd/evidence-index.md`, project `npm run check`, root `npm run check`, and `git diff --check` cover the demonstration while preserving all `SDD-001` through `SDD-010` behavior and the deterministic, model-free runtime boundary.

## Proof plan

Run `npm run demo:feature` from `projects/catalog-consolidation`, then run the focused demonstration test, the project check, the root check, and `git diff --check`. Run `npm run test:fixture` separately when the ignored, hash-verified private inputs are available; its absence does not weaken or become a hidden prerequisite of the public demonstration.

Record the exact commands and results under `AC-011-01` through `AC-011-05` in the evidence index. Change this specification from `ready` to `implemented` only when the command and automated assertions exist, and to `verified` only after every mapped proof passes.

## Cost checkpoint

The delivered demonstration and catalog runtime remain model-free and have zero model cost per execution. Attribute any design-time Harness run to change ID `catalog-one-feature-existence-demo`; unavailable provider usage remains unreconciled rather than being reported as zero.
