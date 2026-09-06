# Verification strategy

Spec ID: `SDD-007`
Status: `verified`
Kind: product specification
Depends on: `SDD-001`, `SDD-002`, `SDD-003`, `SDD-004`, `SDD-005`, `SDD-006`

## Test pyramid

1. Pure unit tests cover parsing, validation, canonicalization, fingerprinting, result aggregation, and error mapping.
2. Repository tests use temporary SQLite databases for migration, constraints, transactions, rollback, and foreign keys.
3. CLI tests exercise the packaged executable, output formats, exit codes, and dry run.
4. Fixture acceptance tests operate only on private copies downloaded by `npm run sources:ingest`.

Tests must be deterministic, offline after source ingestion, independent of execution order, and safe to run concurrently. Never mutate the downloaded reference database; copy it per test.

## Required fixture oracles

Verify the pinned hashes before using the inputs. On the supplied snapshots, assert the source-profile facts from `SDD-000`, clean migration retention of 975 products, a first-run result of 976 products and 268 links, and a zero-insert second run. Also assert dry-run database byte identity, foreign-key integrity, opaque string seller IDs, nullable brands, order independence, and preservation of injection-shaped text.

## Negative and property coverage

Generate table-driven cases for malformed JSON, unknown fields, length limits, seller-entry conflicts, duplicate fingerprints, future schema versions, link conflicts, lock contention, and write failures. Use property tests for normalization idempotence, stable fingerprints, input permutation invariance, and cost-free repeated execution.

Every acceptance criterion receives an automated test or a documented inspection artifact. Tests are linked by criterion ID in the traceability evidence index added during implementation.

## Acceptance criteria

- **AC-007-01:** Unit, repository, CLI, and private-fixture suites run deterministically without a network connection or model call.
- **AC-007-02:** The clean fixture proves migration preservation, expected first-run counts, foreign-key integrity, and zero-insert idempotent rerun.
- **AC-007-03:** Dry run, rollback injection, ambiguity, conflicts, hostile strings, nullable brands, and opaque IDs have explicit negative tests.
- **AC-007-04:** Every product acceptance criterion maps to executable evidence or a named, reproducible inspection step.

## Proof

The implementation change must add one documented test command that runs all public tests and a separate opt-in fixture command that first verifies source hashes. Store no downloaded inputs or database copies in Git.

## Cost checkpoint

Test execution itself is model-free. Model-assisted failure diagnosis is separately attributed to its change and attempt, including retries.
