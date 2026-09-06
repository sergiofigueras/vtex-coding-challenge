# Consolidation, transactions, and idempotency

Spec ID: `SDD-005`
Status: `implemented`
Kind: product specification
Depends on: `SDD-003`, `SDD-004`

## Batch algorithm

Run migration and import inside one `BEGIN IMMEDIATE` transaction:

1. Validate and deduplicate the complete input before opening the write transaction.
2. Backfill or verify the versioned `ProductIdentity` index.
3. For each distinct seller entry, resolve the canonical product fingerprint.
4. Reuse the one matched `Product`, insert a new `Product` plus identity when there is no match, or abort on ambiguity.
5. Insert the `(SellerName, SellerProductId, ProductId)` relationship with a uniqueness constraint as the final idempotency authority.
6. Verify foreign keys and planned counts, then commit. A dry run rolls back deliberately.

Do not use check-then-insert without a database constraint. A pre-existing relationship to a different product is `seller_link_conflict` and aborts the batch. A relationship already pointing to the chosen product is `already_present`.

## Determinism and concurrency

Input order must not affect final products or links. Sort the validated work set by trimmed seller name and opaque seller product ID, then canonical fingerprint. SQLite is treated as a single-writer store; `BEGIN IMMEDIATE`, a bounded busy timeout, and an explicit database-busy error are sufficient. No distributed locking is required.

The supplied clean fixture is expected to plan 268 distinct seller relationships from 269 rows. With the versioned rules in `SDD-004`, it should reuse all but one catalog product, leaving 976 products and 268 seller links after the first committed run. The second run must add nothing. These are snapshot oracles, not general business invariants.

## Failure policy

Any validation conflict, product ambiguity, link conflict, migration error, database error, or post-write invariant failure rolls back the full batch. There is no partial-success mode. Reports describe the failed plan without claiming committed counts.

## Acceptance criteria

- **AC-005-01:** Consolidation reuses exactly one deterministic product match or inserts one product and identity; it never inserts a duplicate canonical fingerprint.
- **AC-005-02:** Seller relationships are unique by `(SellerName, SellerProductId)`, and a conflicting existing mapping aborts the full batch.
- **AC-005-03:** The supplied clean fixture commits to 976 products and 268 seller relationships under normalization version 1.
- **AC-005-04:** A second run against the committed fixture inserts zero products and zero links and leaves the logical database state unchanged.
- **AC-005-05:** Ambiguity or injected failure at any step rolls back migrations, products, identities, and seller links together.

## Proof

Use isolated database copies, shuffle the input order, inject repository failures at each write boundary, and compare normalized table dumps after first and second runs. Assert `PRAGMA foreign_key_check` after success.

## Cost checkpoint

Implementation may use the default Terra route. Transaction, concurrency, and idempotency tests are deterministic and make zero model calls.
