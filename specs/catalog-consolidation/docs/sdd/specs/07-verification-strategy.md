# Verification strategy

Spec ID: `SDD-007`
Status: `ready`
Kind: product specification
Depends on: `SDD-001`, `SDD-002`, `SDD-003`, `SDD-004`, `SDD-005`, `SDD-006`

## Test pyramid

1. Pure unit tests cover parsing, validation, canonicalization, fingerprinting, result aggregation, and error mapping.
2. Repository tests use temporary SQLite databases for migration, constraints, transactions, rollback, and foreign keys.
3. CLI tests exercise the packaged executable, output formats, exit codes, and dry run.
4. Fixture acceptance tests operate only on private copies downloaded by `npm run sources:ingest`.

Tests must be deterministic, offline after source ingestion, independent of execution order, and safe to run concurrently. Never mutate the downloaded reference database; copy it per test.

Declare `build`, `test`, `test:fixture`, and `check` scripts in the project's `package.json`. In particular, `npm run test:fixture` must compile the application and run an assertion-bearing test against a temporary copy of the supplied catalog after the pinned inputs have been ingested and hash-checked. It must fail if the inputs are missing, the first-run result differs from the fixture oracle, or the second run inserts anything. A command documented only in the tutorial but absent from `package.json` is not sufficient.

## Required fixture oracles

Verify the pinned hashes before using the inputs. On the supplied snapshots, assert the source-profile facts from `SDD-000`, clean migration retention of 975 products, a first-run result of 976 products and 268 links, and a zero-insert second run. Also assert dry-run database byte identity, foreign-key integrity, opaque string seller IDs, nullable brands, order independence, and preservation of injection-shaped text.

## Negative and property coverage

Generate table-driven cases for malformed JSON, unknown fields, length limits, seller-entry conflicts, duplicate fingerprints, potential duplicates, genuinely distinct models, future schema versions, link conflicts, lock contention, and write failures. Use property tests for normalization idempotence, stable fingerprints, input permutation invariance, and cost-free repeated execution.

Create the following standalone public test files so the Catalog Consolidation verification section of the repository `README.md` can execute each difficult case with one command. Each file must contain at least one assertion-bearing test; use temporary databases and synthetic input, with the pinned source database reserved for the separate fixture oracle.

| File in `test/` | Required proof |
|---|---|
| `hc-01-cross-seller-match.test.ts` | Two sellers offering one canonical product create one `Product` and two seller links. |
| `hc-02-seller-scoped-id.test.ts` | The same opaque seller product ID may be reused by different sellers, but conflicts for the same seller are rejected. |
| `hc-03-normalized-variants.test.ts` | Formatting, accents, and the three reviewed aliases match an existing product without insertion. |
| `hc-04-potential-duplicate.test.ts` | Same canonical name plus matching brand or category, with another field conflicting or missing, aborts with `potential_duplicate`; cover both catalog and in-batch candidates and verify no mutation. |
| `hc-05-distinct-model.test.ts` | Similar but distinct model names do not false-merge. |
| `hc-06-ambiguous-rollback.test.ts` | Fingerprint collision and seller-link conflict each roll back the complete batch. |
| `hc-07-rerun-order.test.ts` | A second run inserts nothing; shuffled input has identical logical state. |
| `hc-08-hostile-text.test.ts` | Injection-shaped strings remain literal data and schema/foreign keys remain intact. |

The project `npm test` command must include these files, and the files must also run independently with `node --test test/<file>.test.ts` from the project directory. Do not call a green test command evidence for a case if it selects zero tests.

Every acceptance criterion receives an automated test or a documented inspection artifact. Tests are linked by criterion ID in the traceability evidence index added during implementation.

## Acceptance criteria

- **AC-007-01:** Unit, repository, CLI, and private-fixture suites run deterministically without a network connection or model call; the documented `test:fixture` script exists and executes the fixture oracle after verified source ingestion.
- **AC-007-02:** The clean fixture proves migration preservation, expected first-run counts, foreign-key integrity, and zero-insert idempotent rerun.
- **AC-007-03:** Dry run, rollback injection, ambiguity, conflicts, hostile strings, nullable brands, and opaque IDs have explicit negative tests.
- **AC-007-04:** Every product acceptance criterion maps to executable evidence or a named, reproducible inspection step.
- **AC-007-05:** All eight named hard-case test files exist, run independently and through `npm test`, assert the stated outcomes, and are cited by matching command lines in the Catalog Consolidation verification section of the repository `README.md`.

## Proof

The implementation change must add one documented test command that runs all public tests and a separate opt-in `test:fixture` command for use after the source-ingestion command verifies the pinned hashes. Store no downloaded inputs or database copies in Git.

## Cost checkpoint

Test execution itself is model-free. Model-assisted failure diagnosis is separately attributed to its change and attempt, including retries.
