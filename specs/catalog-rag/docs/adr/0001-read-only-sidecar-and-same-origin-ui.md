# ADR 0001: Read-only source, sidecar RAG, and same-origin UI

Status: proposed by SDD-000; accept only with AC-000 evidence.

## Context

`catalog-consolidation` owns a deterministic SQLite catalog and explicitly excludes model runtime. The requested feature needs embeddings, grounded answer generation, an HTTP boundary, and a browser UI without changing that ownership.

## Decision

Create `projects/catalog-rag` as an independent strict-TypeScript project. It opens the final catalog read-only, writes derived documents/vectors/FTS/build state to a replaceable sidecar, rehydrates ranked products from the source before answering, and serves UI plus API from one loopback origin. Model/network access is limited to injected embedding and answer adapters explicitly authorized by ready product specs; default verification injects offline fakes.

Use one deterministic document per `Product.Id`. Start with SQLite FTS5, exact SQL, exact cosine over float32 BLOBs, and reciprocal-rank fusion. The observed catalog size does not justify a native vector extension or separate vector service without a benchmark and a new specification.

## Consequences

The consolidator and final catalog remain reusable and model-free. The RAG index can be rebuilt, source staleness can fail closed, secrets remain server-side, and the UI never accesses a database or provider. Runtime embedding/answer costs require a project-local ledger distinct from the SDD engine's delivery-cost ledger. Public deployment, authentication, chat history, pricing/stock claims, and distributed vector search remain out of scope.
