# SDD acceptance evidence index

## SDD-004: Product identity and deterministic resolution

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-004-01 | `node --test test/product-identity.test.ts` — `canonicalization has deterministic locale-independent golden identities` asserts a fixed versioned fingerprint and canonical fields for Unicode, spacing, punctuation, and quote variants. |
| AC-004-02 | `npm run test:fixture` — `private fixture variants resolve deterministically with only canonical matches` exercises the ingested snapshots and records 265 matched, 3 new, and 0 ambiguous resolutions; public unit coverage exercises all three declared aliases. |
| AC-004-03 | `node --test test/product-identity.test.ts` — `resolution matches canonical variants, preserves new display values, and exposes rules` proves the hostile display text is classified as new and unchanged. |
| AC-004-04 | `node --test test/product-identity.test.ts` — `canonical collisions are explicit and candidate IDs are stable` asserts an ambiguity with sorted candidate IDs rather than an arbitrary match. |
| AC-004-05 | `node --test test/product-identity.test.ts test/migration.test.ts` — alias collision validation rejects conflicting mappings; `identity backfill applies aliases without mutating historical display fields` proves aliases only populate comparison identity values. |

## SDD-005: Consolidation, transactions, and idempotency

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-005-01 | `node --test test/consolidation.test.ts` — `atomically matches, inserts, and idempotently links seller entries` asserts one canonical match, one new product, and exact identity persistence. |
| AC-005-02 | `node --test test/consolidation.test.ts` — `seller link conflict rolls back the entire batch` proves an existing different mapping aborts all planned writes. |
| AC-005-04 | `node --test test/consolidation.test.ts` — the first test asserts a zero-insert, already-present second run. |
| AC-005-05 | `node --test test/consolidation.test.ts` — conflict and dry-run tests prove full transaction rollback including migration work and products. |

`AC-005-03` remains unverified: the current ingested fixture's prior SDD-004 oracle reports 265 matched and 3 new entries, while this specification requires 267 matched and 1 new (976 total products). Reconciling that requires an identity-policy/alias change outside this request's authorized scope.

## SDD-006: Errors, security, and observability

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-006-01 | `node --test test/cli.test.ts` — CLI tests cover stable command and unreadable-path exit behavior and versioned JSON expected-failure output. |
| AC-006-02 | `node --test test/consolidation.test.ts test/migration.test.ts` — hostile text round-trips through parameterized product and seller-link statements while schema checks continue to pass. |
| AC-006-03 | `node --test test/cli.test.ts` — JSON output is a single versioned envelope with generated run ID and no stderr on expected JSON errors. |
| AC-006-04 | `npm test` — all catalog behavior is exercised solely through local Node, SQLite, and filesystem APIs; the production dependency graph contains no network or model SDK. |

The source manifest and traceability ledger use a closed schema and do not accept evidence fields; this separate index preserves the criterion-to-command linkage without weakening their validation contract.
