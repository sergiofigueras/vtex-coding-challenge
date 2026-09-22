# Authority, system boundary, and user journey

Spec ID: `SDD-000`
Status: `ready`
Kind: product specification
Depends on: none

## Authority and intent

Create an independent `catalog-rag` application that consumes the final SQLite database produced by `catalog-consolidation`, supports natural-language product discovery, produces grounded answers with verifiable product citations, and exposes that capability through a local web interface. All implementation must be produced by bounded runs of the repository SDD/DeepSeek Harness workflow rather than by a direct outer Codex implementation.

The source catalog remains authoritative for products, canonical identities, sellers, and seller-scoped identifiers. Embeddings and generated text are derived data and must never redefine product identity or silently modify the catalog.

## Boundary

The application is a separate project under `projects/catalog-rag`. It receives explicit paths for a read-only `catalog.db` and a writable sidecar `rag.db`. It must not import application source from `projects/catalog-consolidation`, depend on a sibling working tree at build time, or require tracked copies of private databases. Reproduce the public source schema in synthetic tests and document compatibility with the published catalog contract.

Use ports for `CatalogReader`, `DocumentProjector`, `EmbeddingProvider`, `VectorIndex`, `Retriever`, `AnswerProvider`, `UsageRecorder`, and `Clock`. Domain, ranking, citation validation, and UI view models must not depend on concrete providers, HTTP parsing, or SQLite extension APIs.

The root repository policy allows a project's runtime to use a model only when that project's own specifications explicitly require it. This specification and `SDD-002`/`SDD-004` authorize model/network calls only inside injected embedding and answer adapters. The consolidator remains model-free. Default tests and release gates remain offline.

## User journey

1. An operator creates or refreshes a sidecar index from an explicit consolidated-catalog path.
2. The operator starts a same-origin local HTTP server with explicit catalog and index paths.
3. A user opens the browser UI, enters a Portuguese or English product question, and submits it by keyboard or pointer.
4. The server validates the request, performs exact/lexical/vector retrieval, rehydrates current source rows, and optionally invokes the configured answer provider.
5. The UI displays either a grounded answer and source cards or an explicit no-evidence/error state. Each factual result exposes `Product.Id` and relevant seller evidence.

## Non-goals

- Changing catalog consolidation, fuzzy product identity, autonomous product mutation, purchasing, pricing, stock, authentication, multi-tenant hosting, or Internet-wide search.
- Claiming knowledge of descriptions, price, inventory, or specifications absent from the source database.
- Sending provider credentials, system prompts, filesystem paths, raw queries, or raw catalog content to the browser or logs.

## Acceptance criteria

- **AC-000-01:** `catalog-rag` is an independent strict-TypeScript project with its own package lock and tests, explicit catalog and sidecar paths, and no build-time or runtime mutation of `projects/catalog-consolidation`.
- **AC-000-02:** Application boundaries expose replaceable catalog, projection, embedding, vector-index, retrieval, answer, usage, and clock ports; deterministic domain services are testable without HTTP, filesystem databases, network calls, or credentials.
- **AC-000-03:** The documented user journey covers index creation, server startup, text submission, grounded answer, citations, no-evidence behavior, retryable failure, and stale-index behavior in Portuguese and English.
- **AC-000-04:** Network/model access is confined to explicitly configured embedding and answer adapters, all normal tests inject offline fakes, the original consolidator remains model-free, and absence of provider configuration fails closed with a stable actionable error.
- **AC-000-05:** README and an ADR record the separate-project decision, source-of-truth boundary, sidecar strategy, exact-search baseline, provider boundary, limitations of the available catalog fields, and separate development/runtime cost domains.

## Proof plan

Validate the project graph; compile strict TypeScript; add dependency-boundary tests; prove the catalog file hash is unchanged after index, search, answer, server, failure, and shutdown tests; and inspect each generated SDD prompt to confirm only requested specs are marked `IMPLEMENT`.

## Cost checkpoint

Use the default SDD route for implementation. The engine ledger measures software-delivery calls only. Runtime provider usage belongs to `catalog-rag` and is specified separately in `SDD-007`.
