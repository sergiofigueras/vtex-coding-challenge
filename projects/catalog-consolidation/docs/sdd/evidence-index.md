# SDD acceptance evidence index

## SDD-000: Source brief and requirement ledger

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-000-01 | `npm run sdd:validate` checks every traceability requirement has an authority class and owning specification. |
| AC-000-02 | `git ls-files` and the README artifact scan show only public summaries, hashes, schema facts, and URLs; private inputs remain under ignored `.sdd/`. |
| AC-000-03 | `docs/sdd/traceability.json`, SDD-000, README, ADRs, and fixture tests label authority, assumptions, and observations separately. |

## SDD-001: System boundary and interface

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-001-01 | `node --test test/cli.test.ts` — `prints help and rejects invalid command arguments` and `returns JSON-only versioned summary and validation exit two` assert command/input failure exit status `2`, while the CLI opens paths before calling consolidation. |
| AC-001-02 | `node --test test/cli.test.ts` — `dry run produces planned counts without changing database bytes` compares SHA-256 before and after the rollback-only run. |
| AC-001-03 | `node --test test/input.test.ts test/product-identity.test.ts` runs pure domain validation and identity tests directly, without spawning the CLI or opening a SQLite database; `node --test test/consolidation.test.ts` exercises orchestration directly rather than through the CLI process. |
| AC-001-04 | `node --test test/cli.test.ts` — `returns JSON-only versioned summary and validation exit two` parses the one-envelope JSON output and asserts no stderr. The concise text renderer is inspected in `src/adapters/reporter.ts`. |

## SDD-002: Input contract and validation

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-002-01 | `npm run sources:ingest && npm run test:fixture` hash-verifies the private JSON then runs `private ProductEntry snapshot validates under the public input contract`, including nullable brands and opaque IDs. |
| AC-002-02 | `node --test test/input.test.ts` — duplicate seller entries, including canonical-equivalent variants, are deduplicated with a stable display representative; seller-scoped opaque IDs (including control-looking text) remain distinct, and conflicting canonical attributes return `seller_entry_conflict`. |
| AC-002-03 | `node --test test/input.test.ts test/cli.test.ts` covers malformed input, closed-object and length violations, bounded one-based diagnostics, and CLI exit `2`. |
| AC-002-04 | `node --test test/input.test.ts test/consolidation.test.ts test/migration.test.ts` verifies hostile quotes, semicolons, comments, Unicode, and control-looking text remain parameterized data. |

## SDD-003: Catalog schema and migrations

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-003-01 | `npm run sources:ingest && npm run test:fixture` runs `migrates the pristine private catalog with its products and clean foreign keys`, asserting 975 products, schema version, indexes, and `foreign_key_check`. |
| AC-003-02 | `node --test test/migration.test.ts` — `re-running the supported migration is a byte-preserving no-op and future versions fail unchanged`. |
| AC-003-03 | `node --test test/migration.test.ts` — `rebuilds numeric seller IDs as text and preserves arbitrary text IDs`. |
| AC-003-04 | `node --test test/migration.test.ts` — `identity collisions abort and restore exact pre-migration bytes`. |

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
| AC-005-01 | `node --test test/consolidation.test.ts test/consolidation.service.test.ts` — `atomically matches, inserts, and idempotently links seller entries` asserts one canonical match, one new product, and exact identity persistence; `opaque control text cannot make ordering depend on input order` proves deterministic work ordering without reserved identifier separators. |
| AC-005-02 | `node --test test/consolidation.test.ts` — `seller link conflict rolls back the entire batch` proves an existing different mapping aborts all planned writes. |
| AC-005-03 | `npm run test:fixture` — `private fixture consolidates once and has a logical no-op rerun` proves 267 matches, 1 new product, 976 total products, 268 seller relationships, and clean foreign keys on the ingested snapshots. |
| AC-005-04 | `npm run test:fixture` — the fixture consolidation test asserts that the committed rerun inserts zero products and links and that normalized product and seller-link table dumps are unchanged. |
| AC-005-05 | `node --test test/consolidation.test.ts test/migration.test.ts` — injected product-write failure, seller-link conflict, dry run, and migration collision tests prove rollback covers schema migration, products, identities, and links. |

## SDD-006: Errors, security, and observability

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-006-01 | `node --test test/cli.test.ts` — CLI tests cover stable command and unreadable-path exit behavior and versioned JSON expected-failure output; expected errors stay on the documented stream and debug stack traces are opt-in. |
| AC-006-02 | `node --test test/consolidation.test.ts test/migration.test.ts` — hostile text round-trips through parameterized product and seller-link statements while schema checks continue to pass. |
| AC-006-03 | `node --test test/cli.test.ts` — JSON output is a single versioned envelope with generated run ID and no stderr on expected JSON errors. |
| AC-006-04 | `npm test` — all catalog behavior is exercised solely through local Node, SQLite, and filesystem APIs; the production dependency graph contains no network or model SDK. |

## SDD-007: Verification strategy

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-007-01 | `npm test` runs the complete public unit, repository, and CLI suite using local Node/SQLite APIs; `npm run sdd:validate` passes with no model or network step. The separate opt-in command is `npm run test:fixture`. |
| AC-007-02 | `npm run test:fixture` — fixture validation, migration retention, deterministic resolution, first-run counts (976 products, 268 links), foreign-key integrity, and zero-insert rerun all pass against temporary copies. |
| AC-007-03 | `npm test` — dry-run byte identity, injected-write rollback, ambiguity/collision rollback, link conflicts, hostile strings, nullable brands, opaque IDs, permutation invariance, and SQLite lock contention are explicit tests in `test/cli.test.ts`, `test/consolidation.test.ts`, `test/migration.test.ts`, `test/input.test.ts`, and `test/property-and-lock.test.ts`. |
| AC-007-04 | This index names executable evidence for SDD-000 through SDD-007; `npm run sdd:validate` validates the manifest and traceability ledger, and each prior product criterion is linked to a command above. |

## SDD-008: Delivery and engineering defense

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-008-01 | Clean-room sequence in `README.md` (`npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run sdd:validate`, `npm run check`) reproduces validation and tests from public repository inputs. `typecheck` uses the pinned real `tsc` compiler; `npm run test:fixture` is separately documented and hash-verifies private snapshots. |
| AC-008-02 | `git ls-files` plus the documented negative secret/artifact scan in `README.md`; ignored `.sdd/` is excluded from the public tree and the project contains no assessment PDFs, downloaded fixtures, databases, credentials, or transcripts. |
| AC-008-03 | `README.md` and ADRs 0001–0003 explain identity, schema preservation, transaction/idempotency, security, AI governance, cost boundaries, limitations, and rejected alternatives. |
| AC-008-04 | `npm run sdd:validate` validates manifest/traceability links; this index provides evidence for every SDD-000 through SDD-008 criterion. The README records exact `sdd:prepare`, `sdd:run`, and `cost:report` commands, enumerates every local `.sdd/runs/<run-id>/` directory, and identifies its per-run log paths. The root reproduction command is `npm --prefix projects/catalog-consolidation run check`; the delivery operator records `git rev-parse HEAD` before handoff. |

## SDD-009: Portable project history and Portuguese tutorial

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-009-01 | `npm run sdd:history:validate -- --snapshot catalog-consolidation-pre-portable-history-2026-09-06` validates the immutable cutoff `2026-09-06T17:58:48.000Z`, 25 runs, 17 sessions, semantic capture and retry coverage. The regenerated manifest reports 86 published files and SHA-256 `d1a417f58a0e955bdd1904654c2f0580a6eef24b7ae58b70fe493b2ab836f390`. |
| AC-009-02 | The same validator verifies hashes, source-to-published mappings and exclusion accounting. Safe audit found no snapshot symlinks, absolute `/Users/` paths, credentials, PDFs, raw SQLite/ProductEntry artifacts or encrypted replay payloads; inventory/exclusion metadata can name excluded source classes without publishing them. |
| AC-009-03 | `TUTORIAL.md` sections 1–4 are Portuguese evidence for authority separation, requirement→decision→spec→implementation→test map, four Mermaid diagrams, deterministic consolidator/security behavior, observed fixture counts, Harness/Cordis architecture, scoped arXiv citation, OpenAI routing, costs, and SDD-095 recovery. |
| AC-009-04 | `TUTORIAL.md` sections 5–6 gives exact clean-clone installation (`npm ci` and `npm --prefix projects/catalog-consolidation ci` from the root, or `npm ci` after changing into the project), separate root infrastructure and project checks, public/fixture tests, CLI, SDD prepare/run, transcript inspection, cost report and project-local history create/validate commands, plus a deterministic SDD-004-bounded exercise verified by `node --test test/product-identity.test.ts`. |
| AC-009-05 | `TUTORIAL.md` section 7 and `.sdd/README.md` document the identity, fixture, confidentiality, cutoff, observable/private-reasoning and provider-cost limits. `npm run sdd:history:validate -- --snapshot catalog-consolidation-pre-portable-history-2026-09-06` passes offline without model or private input. |

The source manifest and traceability ledger use a closed schema and do not accept evidence fields; this separate index preserves the criterion-to-command linkage without weakening their validation contract.
