# Embedding providers and incremental vector index

Spec ID: `SDD-002`
Status: `ready`
Kind: product specification
Depends on: `SDD-001`

## Provider contract

Define an injected `EmbeddingProvider` with stable provider/model identity, dimensions, maximum batch size, timeout, abort propagation, and a batch method that preserves input order. Validate that every output is finite, has the configured dimensions, and corresponds one-to-one with its input. Provider credentials come only from server-side environment/configuration and never enter prompts, client assets, logs, sidecar metadata, or errors.

Provide an offline deterministic fake for all tests. A production adapter may call a configured embedding API because this specification explicitly requires it. Do not silently change model, dimensions, provider, or route after a failure.

## Baseline vector index

Store embeddings as little-endian float32 BLOBs in the sidecar and implement exact cosine similarity behind `VectorIndex`. Reject zero-length, zero-norm, non-finite, mis-sized, or mixed-configuration vectors. Results use descending similarity and `ProductId` ascending as deterministic tie-breaker.

Do not make `sqlite-vec`, another native extension, or a remote vector database mandatory. A later adapter may add one only after a separate spec, runtime compatibility check, pinned version, fallback policy, and benchmark.

## Incremental build

Compare projection/content hash plus provider, model, dimensions, and projection version. Embed only new or changed documents, delete absent products, and treat any provider/model/dimension/projection change as an incompatible revision. Network calls occur before short sidecar write transactions.

Build into a non-ready revision. Only atomic finalization makes it queryable. Interrupted or failed builds preserve the last ready revision, record a safe error code, and can resume without duplicating work. Concurrent builds for the same sidecar are rejected by a bounded lock.

## Acceptance criteria

- **AC-002-01:** `EmbeddingProvider` validates identity, dimensions, batch order, finite outputs, timeout, cancellation, and exact cardinality; a deterministic offline fake covers normal tests and a credentialed production adapter is explicit and server-only.
- **AC-002-02:** The default `VectorIndex` round-trips validated float32 BLOBs and returns exact cosine matches with deterministic `ProductId` tie ordering; corrupt, zero-norm, mixed, or dimension-mismatched vectors fail closed.
- **AC-002-03:** An unchanged rerun requests zero embeddings and performs no logical index changes; one altered seller tuple re-embeds exactly one product; deleted products are removed; configuration/revision changes cannot mix incompatible vectors.
- **AC-002-04:** Provider calls never occur while a SQLite write transaction is open; staged builds expose only the last complete ready revision, recover from interruption, reject concurrent writers, and preserve both source bytes and the prior ready index on failure.
- **AC-002-05:** CLI indexing supports explicit catalog/index paths, provider/model/dimensions, batch size, timeout, dry-run, rebuild, and stable JSON output with bounded counts but no content; invalid configuration fails before network or writes.

## Proof plan

Use fake embeddings with known geometry, randomized order tests, corrupt BLOB cases, injected provider and transaction failures, cancellation, concurrent attempts, unchanged replay, single-product invalidation, full revision change, and source-hash assertions. Keep the real provider smoke test opt-in.

## Cost checkpoint

Record actual runtime embedding usage through `UsageRecorder`; unknown usage is unavailable, never zero. This runtime record is not appended to the engine delivery ledger.
