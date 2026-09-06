# SDD acceptance evidence index

## SDD-004: Product identity and deterministic resolution

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-004-01 | `node --test test/product-identity.test.ts` — `canonicalization has deterministic locale-independent golden identities` asserts a fixed versioned fingerprint and canonical fields for Unicode, spacing, punctuation, and quote variants. |
| AC-004-02 | `npm run test:fixture` — `private fixture variants resolve deterministically with the reviewed token aliases` exercises the ingested snapshots and records 267 matched, 1 new, and 0 ambiguous resolutions; public unit coverage proves aliases replace only exact token sequences. |
| AC-004-03 | `node --test test/product-identity.test.ts` — `resolution matches canonical variants, preserves new display values, and exposes rules` proves the hostile display text is classified as new and unchanged. |
| AC-004-04 | `node --test test/product-identity.test.ts` — `canonical collisions are explicit and candidate IDs are stable` asserts an ambiguity with sorted candidate IDs rather than an arbitrary match. |
| AC-004-05 | `node --test test/product-identity.test.ts test/migration.test.ts` — alias collision validation rejects conflicting mappings; `identity backfill applies aliases without mutating historical display fields` proves aliases only populate comparison identity values. |

## SDD-005: Consolidation, transactions, and idempotency

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-005-01 | `node --test test/consolidation.test.ts` — `atomically matches, inserts, and idempotently links seller entries` asserts one canonical match, one new product, and exact identity persistence. |
| AC-005-02 | `node --test test/consolidation.test.ts` — `seller link conflict rolls back the entire batch` proves an existing different mapping aborts all planned writes. |
| AC-005-03 | `npm run test:fixture` — `private fixture consolidates once and has a logical no-op rerun` proves 267 matches, 1 new product, 976 total products, 268 seller relationships, and clean foreign keys on the ingested snapshots. |
| AC-005-04 | `npm run test:fixture` — the fixture consolidation test asserts that the committed rerun inserts zero products and links and that normalized product and seller-link table dumps are unchanged. |
| AC-005-05 | `node --test test/consolidation.test.ts test/migration.test.ts` — injected product-write failure, seller-link conflict, dry run, and migration collision tests prove rollback covers schema migration, products, identities, and links. |

## SDD-006: Errors, security, and observability

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-006-01 | `node --test test/cli.test.ts` — CLI tests cover stable command and unreadable-path exit behavior and versioned JSON expected-failure output. |
| AC-006-02 | `node --test test/consolidation.test.ts test/migration.test.ts` — hostile text round-trips through parameterized product and seller-link statements while schema checks continue to pass. |
| AC-006-03 | `node --test test/cli.test.ts` — JSON output is a single versioned envelope with generated run ID and no stderr on expected JSON errors. |
| AC-006-04 | `npm test` — all catalog behavior is exercised solely through local Node, SQLite, and filesystem APIs; the production dependency graph contains no network or model SDK. |

## SDD-007: Verification strategy

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-007-01 | `npm test` runs the complete public unit, repository, and CLI suite using local Node/SQLite APIs; `npm run sdd:validate` passes with no model or network step. The separate opt-in command is `npm run test:fixture`. |
| AC-007-02 | `npm run test:fixture` — fixture validation, migration retention, deterministic resolution, first-run counts (976 products, 268 links), foreign-key integrity, and zero-insert rerun all pass against temporary copies. |
| AC-007-03 | `npm test` — dry-run byte identity, injected-write rollback, ambiguity/collision rollback, link conflicts, hostile strings, nullable brands, and opaque IDs are explicit tests in `test/cli.test.ts`, `test/consolidation.test.ts`, `test/migration.test.ts`, and `test/input.test.ts`. |
| AC-007-04 | This index names executable evidence for SDD-000 through SDD-007; `npm run sdd:validate` validates the manifest and traceability ledger, and each prior product criterion is linked to a command above. |

The source manifest and traceability ledger use a closed schema and do not accept evidence fields; this separate index preserves the criterion-to-command linkage without weakening their validation contract.
