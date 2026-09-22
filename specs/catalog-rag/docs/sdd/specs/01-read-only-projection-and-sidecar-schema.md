# Read-only catalog projection and sidecar schema

Spec ID: `SDD-001`
Status: `ready`
Kind: product specification
Depends on: `SDD-000`

## Source contract

Open the supplied catalog with `node:sqlite` in read-only mode and enable foreign-key validation. Verify `Product(Id, Name, Brand, Category)`, `ProductIdentity(ProductId, CanonicalVersion, CanonicalName, CanonicalBrand, CanonicalCategory, Fingerprint)`, and `SellerProduct(Id, SellerName, ProductId, SellerProductId)` before any sidecar write. These are the exact column names required by the catalog-consolidation schema contract.

Reject a missing table or column, unsupported value shape, duplicate canonical fingerprint, broken foreign key, or source that changes during a build. Never migrate the source database. Data-bearing SQL uses bound parameters; identifiers come only from constants.

## Deterministic projection

Read products joined to identity and seller rows ordered by `Product.Id`, `SellerName`, and `SellerProductId`. Produce exactly one document per product. Content contains display name, nullable brand/category with a stable missing-value representation, canonical name/brand/category, and seller names. Opaque IDs stay in structured metadata and lexical indexing rather than semantic identity evidence.

Compute `contentHash` as SHA-256 over a versioned stable JSON projection containing product, canonical identity, and sorted seller tuples. A seller-link change must change only its product document hash. `Fingerprint` alone is insufficient because it does not cover sellers.

## Sidecar schema

Create a versioned writable sidecar SQLite database containing `RagIndexState`, `RagDocument`, `RagEmbedding`, `RagDocumentFts`, and `RagUsage`. Track source fingerprint, projection version, embedding configuration, build state, deterministic content/hash, filter metadata, float32 vector BLOB, timestamps, and safe usage fields. The sidecar cannot rely on cross-file foreign keys; reconciliation removes orphan rows and validates every indexed product against the source.

## Acceptance criteria

- **AC-001-01:** The source adapter opens only an explicitly supplied regular catalog file in read-only mode, verifies schema and foreign keys, rejects incompatible input before sidecar mutation, and leaves the source SHA-256 unchanged on every success and failure path.
- **AC-001-02:** Projection is locale-independent and deterministic: one ordered document per `Product.Id`, sorted sellers, stable null rendering, raw and canonical search text, structured opaque identifiers, and no unrequested catalog fields.
- **AC-001-03:** A versioned stable JSON projection produces a SHA-256 content hash; identical input is byte-stable, changing one seller tuple changes exactly one product hash, and canonical identity is not replaced by similarity.
- **AC-001-04:** Sidecar migration is atomic, idempotent, versioned with `PRAGMA user_version`, validates float32 BLOB lengths and build states, creates FTS5 support, and rolls back fully on injected failure.
- **AC-001-05:** Synthetic fixtures prove empty catalogs, nullable fields, Unicode, multiple sellers, opaque IDs, hostile text treated as data, orphan cleanup, incompatible schemas, and the observed private fixture count only in an opt-in test that never prints row content.

## Proof plan

Use temporary synthetic source and sidecar databases. Assert ordered projections and golden hashes, migration SQL, table/index shapes, row counts, rollback, exact source bytes, and optional fixture counts without tracking any database.

## Cost checkpoint

Projection, hashing, schema inspection, migration, FTS indexing, and all proof are deterministic and must not call a model.
