# Hybrid retrieval and source rehydration

Spec ID: `SDD-003`
Status: `ready`
Kind: product specification
Depends on: `SDD-001`, `SDD-002`

## Retrieval contract

Accept a normalized Unicode query, optional exact filters for brand, category, and seller, and a bounded `topK`. Route exact product and seller-product identifiers without requiring an embedding call. For natural-language input, obtain one query embedding whose provider, model, and dimensions must match the ready index.

Use three independently testable channels:

1. parameterized exact SQL for identifiers and exact filters;
2. FTS5 lexical matching over the projected product document;
3. exact cosine similarity over the validated vectors in the ready revision.

Combine available ranked channels through documented reciprocal-rank fusion. A channel failure cannot change the scoring rules of another channel. Sort equal fused scores by `ProductId` ascending. The default result count is 8 and the hard maximum is 20.

## Fresh evidence

After ranking, re-read the winning product, canonical identity, and ordered seller rows from the source database. Drop candidates no longer present and reject the request as stale when the current source fingerprint or projected row hash is incompatible with the ready index. The answer layer receives only this bounded, rehydrated evidence.

Retrieval result metadata includes `ProductId`, rank, participating channels, matched exact fields, source fingerprint, and rehydrated seller evidence. Raw vector scores are diagnostic data and must not be presented as confidence or product quality.

## Acceptance criteria

- **AC-003-01:** Retrieval supports exact product and seller-product identifiers, parameterized seller, brand, and category filters, FTS5 lexical matching, and semantic vector matching without interpolated SQL.
- **AC-003-02:** Hybrid results use documented reciprocal-rank fusion and stable `ProductId` tie-breaking, so identical input and provider vectors produce identical ordered product IDs.
- **AC-003-03:** Exact identifier queries do not require an embedding call, while natural-language queries fail clearly when their configured embedding provenance is incompatible with the ready index.
- **AC-003-04:** Retrieval enforces a default `topK` of 8, a maximum of 20, bounded query and filter lengths, and cancellation and timeout propagation across every channel.
- **AC-003-05:** Final candidates are rehydrated from the read-only source catalog with product and seller provenance sufficient for citations; a stale or unavailable source is never silently answered from index text.

## Proof plan

Use synthetic catalogs and deterministic vector geometry to prove exact-ID short-circuiting, filter intersection, lexical-only, semantic-only, fused ordering, ties, unavailable channels, cancellation, stale rows, source changes, and seller evidence. Assert that every SQL value is bound and that identical runs return byte-identical ordered IDs and channel labels.

## Cost checkpoint

Only natural-language semantic retrieval consumes an embedding call. Record its runtime usage separately from the SDD delivery ledger; exact and lexical retrieval remain model-free.
