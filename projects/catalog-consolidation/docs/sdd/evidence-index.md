# SDD acceptance evidence index

## SDD-004: Product identity and deterministic resolution

| Acceptance criterion | Reproducible evidence |
|---|---|
| AC-004-01 | `node --test test/product-identity.test.ts` — `canonicalization has deterministic locale-independent golden identities` asserts a fixed versioned fingerprint and canonical fields for Unicode, spacing, punctuation, and quote variants. |
| AC-004-02 | `npm run test:fixture` — `private fixture variants resolve deterministically with only canonical matches` exercises the ingested snapshots and records 265 matched, 3 new, and 0 ambiguous resolutions; public unit coverage exercises all three declared aliases. |
| AC-004-03 | `node --test test/product-identity.test.ts` — `resolution matches canonical variants, preserves new display values, and exposes rules` proves the hostile display text is classified as new and unchanged. |
| AC-004-04 | `node --test test/product-identity.test.ts` — `canonical collisions are explicit and candidate IDs are stable` asserts an ambiguity with sorted candidate IDs rather than an arbitrary match. |
| AC-004-05 | `node --test test/product-identity.test.ts test/migration.test.ts` — alias collision validation rejects conflicting mappings; `identity backfill applies aliases without mutating historical display fields` proves aliases only populate comparison identity values. |

The source manifest and traceability ledger use a closed schema and do not accept evidence fields; this separate index preserves the criterion-to-command linkage without weakening their validation contract.
